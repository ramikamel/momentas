import { randomUUID } from "node:crypto";
import type {
  AuthorMemoryView,
  DraftInput,
  ImageVersion,
  ImageVersionView,
  MemoryMessage,
  PublishedMemoryView,
  RenderInput,
  Store,
} from "@/lib/memory/types";
import {
  draftSchema,
  messageSchema,
  publishSchema,
  renderSchema,
  replySchema,
} from "@/lib/memory/schema";
import { validateSceneEvidence } from "@/lib/memory/prompts";
import { AppError, createToken, hashToken, shareTokenFor } from "./access";
import { getAiProvider, validateGeneratedImage, type AiProvider } from "./meta";
import { getStore } from "./store";
import {
  requireAuthor,
  requireShared,
  publicationView,
  requireComparison,
} from "./authorization";
import { PerspectiveService } from "./perspectives";
import { z } from "zod";

export class MemoryService {
  constructor(
    private store: Store,
    private ai: AiProvider,
  ) {}
  private async requireAuthor(id: string, token: string) {
    return requireAuthor(this.store, { memoryId: id, ownerToken: token });
  }
  private async requireShared(token: string) {
    return requireShared(this.store, token);
  }
  private checkAi() {
    if (this.ai.configured === false)
      throw new AppError(
        "Image creation is not connected yet. Your memory is saved.",
        503,
        "META_NOT_CONFIGURED",
      );
  }
  async createMemory(input: DraftInput) {
    const draft = draftSchema.parse(input),
      id = randomUUID(),
      authorToken = createToken();
    await this.store.createMemory({
      ...draft,
      id,
      authorTokenHash: hashToken(authorToken),
      shareTokenHash: null,
      publishedVersionId: null,
      publishedCaption: "",
      publishedTitle: "",
      publishedAuthorName: "",
      publishedRecipientName: "",
      createdAt: new Date().toISOString(),
    });
    return { id, authorToken };
  }
  async getAuthorMemory(id: string, token: string): Promise<AuthorMemoryView> {
    const m = await this.requireAuthor(id, token);
    const versions = await Promise.all(
      (await this.store.versions(id)).map(async (v) => ({
        ...v,
        imageUrl: await this.store.imageUrl(v.imagePath, id, v.id),
      })),
    );
    const messages = await this.store.messages(id);
    const publicationIds = [
      ...new Set(
        messages
          .map((message) => message.publicationId)
          .filter((value): value is string => !!value),
      ),
    ];
    const messagePublications = await Promise.all(
      publicationIds.map((pid) => this.store.getPublication(pid)),
    );
    const contextualMessages = messages.map((message) => ({
      ...message,
      pinContext:
        messagePublications
          .find((p) => p?.id === message.publicationId)
          ?.pins.find((pin) => pin.id === message.pinId) ?? null,
    }));
    return {
      id: m.id,
      title: m.title,
      authorName: m.authorName,
      recipientName: m.recipientName,
      story: m.story,
      narrationId: m.narrationId ?? null,
      currentPublicationId: m.currentPublicationId ?? null,
      narrations: await Promise.all(
        (await this.store.narrations(id)).map(async (n) => {
          const { audioPath: _, ...v } = n;
          void _;
          return { ...v, audioUrl: await this.store.audioUrl(n) };
        }),
      ),
      pinsByVersion: Object.fromEntries(
        await Promise.all(
          versions.map(async (v) => [
            v.id,
            await this.store.getVersionPins(id, v.id),
          ]),
        ),
      ),
      perspective: await new PerspectiveService(this.store).authorContext({
        memoryId: id,
        ownerToken: token,
      }),
      scenePlan: m.scenePlan,
      createdAt: m.createdAt,
      versions,
      messages: contextualMessages,
      publishedVersionId: m.publishedVersionId,
      publishedCaption: m.publishedCaption,
      shareUrl: m.shareTokenHash ? `/share/${shareTokenFor(token, id)}` : null,
    };
  }
  async saveDraft(id: string, token: string, input: DraftInput): Promise<void> {
    await this.requireAuthor(id, token);
    const draft = draftSchema.parse(input);
    if (draft.narrationId) {
      const n = await this.store.getNarration(draft.narrationId);
      if (!n || n.memoryId !== id)
        throw new AppError("Choose your own recording.", 403);
    }
    await this.store.updateMemory(id, draft);
  }
  async extractScene(id: string, token: string, story: string) {
    const m = await this.requireAuthor(id, token);
    z.string().trim().min(1).max(6000).parse(story);
    const draft = draftSchema.parse({ ...m, story });
    await this.store.updateMemory(id, { story: draft.story });
    this.checkAi();
    const plan = await this.ai.extractScene(draft.story);
    validateSceneEvidence(draft.story, plan);
    await this.store.updateMemory(id, { scenePlan: plan });
    return plan;
  }
  async renderVersion(
    id: string,
    token: string,
    raw: RenderInput,
  ): Promise<ImageVersionView> {
    await this.requireAuthor(id, token);
    const input = renderSchema.parse(raw);
    this.checkAi();
    const base = input.baseVersionId
      ? (await this.store.versions(id)).find(
          (v) => v.id === input.baseVersionId,
        )
      : null;
    if (input.baseVersionId && !base)
      throw new AppError("The selected image was not found.", 404, "NOT_FOUND");
    const reservation = await this.store.reserveRender(
      id,
      input.requestId,
      null,
    );
    if (reservation.kind === "completed") {
      const v = reservation.version;
      return {
        ...v,
        imageUrl: await this.store.imageUrl(v.imagePath, id, v.id),
      };
    }
    return this.produceVersion(id, input, base ?? null);
  }
  async generateFromStory(
    id: string,
    token: string,
    requestId: string,
  ): Promise<ImageVersionView> {
    const memory = await this.requireAuthor(id, token);
    z.uuid().parse(requestId);
    z.string().trim().min(1).max(6000).parse(memory.story);
    this.checkAi();
    const prior = await this.store.getRenderRequest(id, requestId);
    if (
      prior?.status === "failed" ||
      (prior?.status === "pending" && Date.parse(prior.expiresAt) <= Date.now())
    ) {
      await this.store.failRender(id, requestId).catch(() => {});
      throw new AppError(
        "The previous attempt ended before an image was saved. Submit again to retry.",
        409,
        "GENERATION_FAILED",
      );
    }
    if (prior?.status === "pending")
      throw new AppError(
        "Your image is still being created. Try again shortly or open Saved pictures.",
        409,
        "GENERATION_PENDING",
      );
    const reservation = await this.store.reserveRender(id, requestId, null);
    if (reservation.kind === "completed") {
      const v = reservation.version;
      return {
        ...v,
        imageUrl: await this.store.imageUrl(v.imagePath, id, v.id),
      };
    }
    try {
      const plan = await this.extractScene(id, token, memory.story);
      // Clicking Submit authorizes generation; detailed scene editing is optional.
      return await this.produceVersion(
        id,
        {
          requestId,
          scene: { plan, authorAdditions: "", confirmed: true },
          baseVersionId: null,
          instruction: null,
        },
        null,
      );
    } catch (e) {
      await this.store.failRender(id, requestId).catch(() => {});
      throw new AppError(
        e instanceof AppError
          ? e.message
          : "We couldn’t generate this image. Your draft is saved. Please try again.",
        e instanceof AppError ? e.status : 502,
        "GENERATION_FAILED",
      );
    }
  }
  private async produceVersion(
    id: string,
    input: RenderInput,
    base: ImageVersion | null,
  ): Promise<ImageVersionView> {
    let uploadedPath: string | null = null;
    try {
      const image = base
        ? await this.ai.editImage(
            await this.store.readImage(base.imagePath),
            input.scene,
            input.instruction!,
          )
        : await this.ai.generateImage(input.scene);
      validateGeneratedImage(image);
      const versionId = randomUUID(),
        extension =
          image.mimeType === "image/png"
            ? "png"
            : image.mimeType === "image/jpeg"
              ? "jpg"
              : "webp";
      const version: ImageVersion = {
        id: versionId,
        memoryId: id,
        parentVersionId: base?.id || null,
        imagePath: `${id}/${versionId}.${extension}`,
        scene: input.scene,
        instruction: input.instruction,
        createdAt: new Date().toISOString(),
      };
      await this.store.putImage(version.imagePath, image);
      uploadedPath = version.imagePath;
      await this.store.completeRender(id, input.requestId, version);
      uploadedPath = null;
      return {
        ...version,
        // Owner-authenticated URL avoids a signing request after the render is
        // committed; a lost response can safely replay the same request ID.
        imageUrl: `/api/memories/${id}/images/${version.id}`,
      };
    } catch (error) {
      if (uploadedPath)
        await this.store.removeImage(uploadedPath).catch(() => {});
      await this.store.failRender(id, input.requestId).catch(() => {});
      throw error;
    }
  }
  async publishMemory(
    id: string,
    token: string,
    versionId: string,
    caption: string,
    includeNarration = false,
  ) {
    await this.requireAuthor(id, token);
    const input = publishSchema.parse({ versionId, caption });
    if (!(await this.store.versions(id)).some((v) => v.id === input.versionId))
      throw new AppError("Choose an image from this memory.", 404, "NOT_FOUND");
    const shareToken = shareTokenFor(token, id);
    await this.store.publishSnapshot(id, {
      versionId: input.versionId,
      caption: input.caption,
      includeNarration,
      shareTokenHash: hashToken(shareToken),
    });
    return { shareUrl: `/share/${shareToken}` };
  }
  async getSharedMemory(token: string): Promise<PublishedMemoryView> {
    const m = await this.requireShared(token);
    const version = (await this.store.versions(m.id)).find(
      (v) => v.id === m.publishedVersionId,
    );
    if (!version)
      throw new AppError("This image is not available.", 404, "NOT_FOUND");
    const p = m.currentPublicationId
      ? await this.store.getPublication(m.currentPublicationId)
      : null;
    const view = p
      ? await publicationView(this.store, p, { share: token })
      : null;
    return {
      publicationId: p?.id,
      pins: p?.pins ?? [],
      narration: view?.narration ?? null,
      title: m.publishedTitle,
      authorName: m.publishedAuthorName,
      recipientName: m.publishedRecipientName,
      caption: m.publishedCaption,
      versionId: version.id,
      imageUrl: await this.store.imageUrl(
        version.imagePath,
        m.id,
        version.id,
        token,
      ),
      imageDescription: `AI reconstruction of ${m.publishedTitle}, shaped by its storyteller.`,
      messages: (await this.store.messages(m.id)).map((message) => ({
        ...message,
        pinContext:
          message.publicationId === p?.id
            ? (p?.pins.find((pin) => pin.id === message.pinId) ?? null)
            : null,
      })),
    };
  }
  async postRecipientMessage(
    token: string,
    raw: {
      versionId: string;
      displayName: string;
      text: string;
      publicationId?: string | null;
      pinId?: string | null;
    },
  ): Promise<MemoryMessage> {
    const m = await this.requireShared(token),
      input = messageSchema.parse(raw);
    if (m.publishedVersionId !== input.versionId)
      throw new AppError(
        "A newer image has been shared. Refresh to see it; your question is still here.",
        409,
        "VERSION_CHANGED",
      );
    if (input.publicationId && input.publicationId !== m.currentPublicationId)
      throw new AppError(
        "This shared memory changed. Refresh before sending; your words are still here.",
        409,
        "VERSION_CHANGED",
      );
    if (input.pinId && !input.publicationId)
      throw new AppError("Select the current published detail.", 400);
    const message: MemoryMessage = {
      id: randomUUID(),
      memoryId: m.id,
      versionId: input.versionId,
      publicationId: input.publicationId ?? m.currentPublicationId ?? null,
      pinId: input.pinId ?? null,
      role: "recipient",
      displayName: input.displayName,
      text: input.text,
      parentId: null,
      createdAt: new Date().toISOString(),
    };
    if (message.publicationId)
      await this.store.addPublishedMessage(message, {
        kind: "current",
        publicationId: message.publicationId,
      });
    else await this.store.addMessage(message, input.versionId);
    return message;
  }
  async postStorytellerReply(
    id: string,
    token: string,
    parentId: string,
    text: string,
  ): Promise<MemoryMessage> {
    const m = await this.requireAuthor(id, token),
      input = replySchema.parse({ parentId, text });
    const parent = (await this.store.messages(id)).find(
      (x) => x.id === input.parentId && x.role === "recipient",
    );
    if (!parent)
      throw new AppError("The question was not found.", 404, "NOT_FOUND");
    const reply: MemoryMessage = {
      id: randomUUID(),
      memoryId: id,
      versionId: parent.versionId,
      role: "storyteller",
      displayName: m.publishedAuthorName || m.authorName,
      text: input.text,
      parentId: parent.id,
      publicationId: parent.publicationId ?? null,
      pinId: parent.pinId ?? null,
      createdAt: new Date().toISOString(),
    };
    await this.store.addMessage(reply);
    return reply;
  }
  async getImage(
    id: string,
    versionId: string,
    authorToken: string,
    shareToken: string | null,
    comparisonToken: string | null = null,
  ) {
    if (comparisonToken) {
      const link = await requireComparison(this.store, comparisonToken);
      const pubs = await Promise.all([
        this.store.getPublication(link.originalPublicationId),
        this.store.getPublication(link.contributionPublicationId!),
      ]);
      if (!pubs.some((p) => p?.memoryId === id && p.versionId === versionId))
        throw new AppError("This image is not shared.", 403);
    } else if (shareToken) {
      const m = await this.requireShared(shareToken);
      if (m.id !== id || m.publishedVersionId !== versionId)
        throw new AppError("This image is not shared.", 403, "IMAGE_DENIED");
    } else await this.requireAuthor(id, authorToken);
    const version = (await this.store.versions(id)).find(
      (v) => v.id === versionId,
    );
    if (!version) throw new AppError("Image not found.", 404, "NOT_FOUND");
    return this.store.readImage(version.imagePath);
  }
}
export function getMemoryService() {
  return new MemoryService(getStore(), getAiProvider());
}
