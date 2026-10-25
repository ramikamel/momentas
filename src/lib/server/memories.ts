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
import {
  AppError,
  createToken,
  hashToken,
  matchesToken,
  shareTokenFor,
} from "./access";
import { getAiProvider, validateGeneratedImage, type AiProvider } from "./meta";
import { getStore } from "./store";

export class MemoryService {
  constructor(
    private store: Store,
    private ai: AiProvider,
  ) {}
  private async requireAuthor(id: string, token: string) {
    const memory = await this.store.getMemory(id);
    if (!memory || !matchesToken(token, memory.authorTokenHash))
      throw new AppError(
        "Open this memory in the browser where you created it to edit it.",
        403,
        "AUTHOR_REQUIRED",
      );
    return memory;
  }
  private async requireShared(token: string) {
    if (!token || token.length > 128)
      throw new AppError("This shared memory was not found.", 404, "NOT_FOUND");
    const m = await this.store.findShared(hashToken(token));
    if (!m || !m.publishedVersionId)
      throw new AppError("This shared memory was not found.", 404, "NOT_FOUND");
    return m;
  }
  private checkAi() {
    if (this.ai.configured === false)
      throw new AppError(
        "AI illustration is not connected yet. Your memory is saved.",
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
    return {
      id: m.id,
      title: m.title,
      authorName: m.authorName,
      recipientName: m.recipientName,
      story: m.story,
      scenePlan: m.scenePlan,
      createdAt: m.createdAt,
      versions,
      messages: await this.store.messages(id),
      publishedVersionId: m.publishedVersionId,
      publishedCaption: m.publishedCaption,
      shareUrl: m.shareTokenHash ? `/share/${shareTokenFor(token, id)}` : null,
    };
  }
  async saveDraft(id: string, token: string, input: DraftInput): Promise<void> {
    await this.requireAuthor(id, token);
    await this.store.updateMemory(id, draftSchema.parse(input));
  }
  async extractScene(id: string, token: string, story: string) {
    const m = await this.requireAuthor(id, token);
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
    const cap = Number(process.env.MAX_IMAGE_REQUESTS || "24");
    const reservation = await this.store.reserveRender(
      id,
      input.requestId,
      Number.isInteger(cap) && cap > 0 ? cap : 24,
    );
    if (reservation.kind === "completed") {
      const v = reservation.version;
      return {
        ...v,
        imageUrl: await this.store.imageUrl(v.imagePath, id, v.id),
      };
    }
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
        imageUrl: await this.store.imageUrl(version.imagePath, id, version.id),
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
  ) {
    const m = await this.requireAuthor(id, token);
    const input = publishSchema.parse({ versionId, caption });
    if (!(await this.store.versions(id)).some((v) => v.id === input.versionId))
      throw new AppError("Choose an image from this memory.", 404, "NOT_FOUND");
    const shareToken = shareTokenFor(token, id);
    await this.store.updateMemory(id, {
      publishedVersionId: input.versionId,
      publishedCaption: input.caption,
      publishedTitle: m.title,
      publishedAuthorName: m.authorName,
      publishedRecipientName: m.recipientName,
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
      throw new AppError(
        "This illustration is not available.",
        404,
        "NOT_FOUND",
      );
    return {
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
      imageDescription:
        version.scene.plan.setting?.text ||
        "An illustrated memory, shaped by its storyteller.",
      messages: await this.store.messages(m.id),
    };
  }
  async postRecipientMessage(
    token: string,
    raw: { versionId: string; displayName: string; text: string },
  ): Promise<MemoryMessage> {
    const m = await this.requireShared(token),
      input = messageSchema.parse(raw);
    if (m.publishedVersionId !== input.versionId)
      throw new AppError(
        "A newer illustration has been shared. Refresh to see it; your question is still here.",
        409,
        "VERSION_CHANGED",
      );
    const message: MemoryMessage = {
      id: randomUUID(),
      memoryId: m.id,
      versionId: input.versionId,
      role: "recipient",
      displayName: input.displayName,
      text: input.text,
      parentId: null,
      createdAt: new Date().toISOString(),
    };
    await this.store.addMessage(message, input.versionId);
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
  ) {
    if (shareToken) {
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
