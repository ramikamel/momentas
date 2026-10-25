import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Store, MemoryMessage, MemoryRecord } from "@/lib/memory/types";
import type {
  AuthorAuth,
  ComparisonSynthesis,
  ComparisonView,
  ComparisonSource,
} from "@/lib/memory/connections";
import { buildComparisonSources } from "@/lib/memory/comparison";
import { messageSchema } from "@/lib/memory/schema";
import {
  AppError,
  hashToken,
  perspectiveInviteToken,
  perspectiveContributorToken,
  perspectiveComparisonToken,
} from "./access";
import {
  requireAuthor,
  requireComparison,
  publicationView,
} from "./authorization";
import { comparePerspectives } from "./comparison";
export class PerspectiveService {
  constructor(
    private store: Store,
    private compare: (
      sources: [ComparisonSource, ComparisonSource],
    ) => Promise<ComparisonSynthesis> = comparePerspectives,
  ) {}
  async authorContext(auth: AuthorAuth) {
    await requireAuthor(this.store, auth);
    const link = await this.store.findPerspectiveByMemory(auth.memoryId);
    if (!link) return null;
    const original = link.originalMemoryId === auth.memoryId;
    const invite = original
      ? perspectiveInviteToken(auth.ownerToken, link.id)
      : null;
    const contributor = invite
      ? perspectiveContributorToken(invite, link.id)
      : auth.ownerToken;
    return {
      id: link.id,
      eventLabel: link.eventLabel,
      role: original ? ("original" as const) : ("contributor" as const),
      inviteUrl: invite ? `/perspective/${invite}` : null,
      comparisonUrl: `/compare/${perspectiveComparisonToken(contributor, link.id)}`,
      attached: !!link.contributionPublicationId,
      synthesisStatus: link.synthesisStatus,
    };
  }
  async createInvite(auth: AuthorAuth, eventLabel: string) {
    const m = await requireAuthor(this.store, auth);
    const existing = await this.store.findPerspectiveByMemory(auth.memoryId);
    if (existing && existing.originalMemoryId !== auth.memoryId)
      throw new AppError(
        "This memory is already a contribution to a comparison.",
        409,
      );
    const label = z.string().trim().min(1).max(120).parse(eventLabel);
    if (!m.currentPublicationId)
      throw new AppError(
        "Publish a memory before inviting another perspective.",
        409,
      );
    const id = randomUUID(),
      invite = perspectiveInviteToken(auth.ownerToken, id),
      contributor = perspectiveContributorToken(invite, id);
    await this.store.createOrGetPerspectiveLink({
      id,
      originalMemoryId: m.id,
      originalPublicationId: m.currentPublicationId,
      eventLabel: label,
      inviteTokenHash: hashToken(invite),
      comparisonTokenHash: hashToken(
        perspectiveComparisonToken(contributor, id),
      ),
      contributionMemoryId: null,
      contributionPublicationId: null,
      synthesisStatus: "idle",
      synthesis: null,
      createdAt: new Date().toISOString(),
    });
    return this.authorContext(auth);
  }
  private async invited(token: string) {
    if (!token || token.length > 128)
      throw new AppError("Invitation not found.", 404);
    const link = await this.store.findPerspectiveByInviteHash(hashToken(token));
    if (!link) throw new AppError("Invitation not found.", 404);
    return link;
  }
  async getInvite(token: string) {
    const link = await this.invited(token),
      p = await this.store.getPublication(link.originalPublicationId);
    if (!p) throw new AppError("Invitation not available.", 404);
    return {
      eventLabel: link.eventLabel,
      inviterName: p.authorName,
      contributionExists: !!link.contributionMemoryId,
    };
  }
  async claim(token: string, authorName: string) {
    const link = await this.invited(token),
      name = z.string().trim().min(1).max(80).parse(authorName),
      original = await this.store.getPublication(link.originalPublicationId);
    if (!original) throw new AppError("Invitation not available.", 404);
    const contributorToken = perspectiveContributorToken(token, link.id);
    const candidate: MemoryRecord = {
      id: randomUUID(),
      title: link.eventLabel,
      authorName: name,
      recipientName: original.authorName,
      story: "",
      scenePlan: null,
      narrationId: null,
      currentPublicationId: null,
      authorTokenHash: hashToken(contributorToken),
      shareTokenHash: null,
      publishedVersionId: null,
      publishedCaption: "",
      publishedTitle: "",
      publishedAuthorName: "",
      publishedRecipientName: "",
      createdAt: new Date().toISOString(),
    };
    const memoryId = await this.store.claimPerspective(link.id, candidate);
    return { memoryId, contributorToken };
  }
  async attachContribution(
    auth: AuthorAuth,
    linkId: string,
    publicationId: string,
  ) {
    const m = await requireAuthor(this.store, auth),
      link = await this.store.getPerspectiveLink(linkId);
    if (!link || link.contributionMemoryId !== m.id)
      throw new AppError(
        "This invitation does not belong to your contribution.",
        403,
      );
    if (m.currentPublicationId !== publicationId)
      throw new AppError("Publish and select your current version first.", 409);
    await this.store.attachPerspectivePublication(link.id, m.id, publicationId);
    return {
      comparisonUrl: `/compare/${perspectiveComparisonToken(auth.ownerToken, link.id)}`,
    };
  }
  async synthesize(auth: AuthorAuth, linkId: string, requestId: string) {
    await requireAuthor(this.store, auth);
    z.uuid().parse(requestId);
    const link = await this.store.getPerspectiveLink(linkId);
    if (
      !link ||
      ![link.originalMemoryId, link.contributionMemoryId].includes(
        auth.memoryId,
      )
    )
      throw new AppError("This comparison is not yours.", 403);
    if (!link.contributionPublicationId)
      throw new AppError("Both perspectives must be shared first.", 409);
    if (link.synthesisStatus === "complete" && link.synthesis)
      return link.synthesis;
    const cap = Number(process.env.MAX_COMPARISON_REQUESTS || 24);
    const reservation = await this.store.reserveConnectionRequest(
      "comparison",
      link.id,
      requestId,
      Number.isInteger(cap) && cap > 0 ? cap : 24,
    );
    if (reservation === "completed")
      return (await this.store.getPerspectiveLink(link.id))!.synthesis;
    try {
      const left = await this.store.getPublication(link.originalPublicationId),
        right = await this.store.getPublication(link.contributionPublicationId);
      if (!left || !right)
        throw new AppError("Published perspective not found.", 404);
      const result = await this.compare(buildComparisonSources(left, right));
      await this.store.completeConnectionRequest(
        "comparison",
        link.id,
        requestId,
        { synthesis: result },
      );
      return result;
    } catch (error) {
      await this.store
        .failConnectionRequest("comparison", link.id, requestId)
        .catch(() => {});
      throw error;
    }
  }
  async getComparison(token: string): Promise<ComparisonView> {
    const link = await requireComparison(this.store, token);
    const [l, r] = await Promise.all([
      this.store.getPublication(link.originalPublicationId),
      this.store.getPublication(link.contributionPublicationId!),
    ]);
    if (!l || !r) throw new AppError("Published perspectives not found.", 404);
    const [left, right, lm, rm] = await Promise.all([
      publicationView(this.store, l, { comparison: token }),
      publicationView(this.store, r, { comparison: token }),
      this.store.messages(l.memoryId),
      this.store.messages(r.memoryId),
    ]);
    return {
      left,
      right,
      synthesisStatus: link.synthesisStatus,
      synthesis: link.synthesis,
      messages: [...lm, ...rm]
        .filter((m) => m.publicationId === l.id || m.publicationId === r.id)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    };
  }
  async postComparisonMessage(token: string, raw: unknown) {
    const link = await requireComparison(this.store, token);
    const input = messageSchema
      .omit({ versionId: true })
      .extend({ side: z.enum(["left", "right"]), publicationId: z.uuid() })
      .parse(raw);
    const p = await this.store.getPublication(
      input.side === "left"
        ? link.originalPublicationId
        : link.contributionPublicationId!,
    );
    if (!p || p.id !== input.publicationId)
      throw new AppError("Choose a detail in this comparison.", 409);
    if (input.pinId && !p.pins.some((pin) => pin.id === input.pinId))
      throw new AppError(
        "This detail does not belong to this perspective.",
        400,
      );
    const message: MemoryMessage = {
      id: randomUUID(),
      memoryId: p.memoryId,
      versionId: p.versionId,
      publicationId: p.id,
      pinId: input.pinId ?? null,
      role: "recipient",
      displayName: input.displayName,
      text: input.text,
      parentId: null,
      createdAt: new Date().toISOString(),
    };
    await this.store.addPublishedMessage(message, {
      kind: "comparison",
      linkId: link.id,
      publicationId: p.id,
    });
    return message;
  }
}
