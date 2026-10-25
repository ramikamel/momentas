import type { Store } from "@/lib/memory/types";
import type {
  AuthorAuth,
  PublicationSnapshot,
  PublicationView,
} from "@/lib/memory/connections";
import { AppError, hashToken, matchesToken } from "./access";
export async function requireAuthor(store: Store, auth: AuthorAuth) {
  const memory = await store.getMemory(auth.memoryId);
  if (!memory || !matchesToken(auth.ownerToken, memory.authorTokenHash))
    throw new AppError(
      "Open this memory in the browser where you created it to edit it.",
      403,
      "AUTHOR_REQUIRED",
    );
  return memory;
}
export async function requireShared(store: Store, token: string) {
  if (!token || token.length > 128)
    throw new AppError("This shared memory was not found.", 404, "NOT_FOUND");
  const memory = await store.findShared(hashToken(token));
  if (!memory?.publishedVersionId)
    throw new AppError("This shared memory was not found.", 404, "NOT_FOUND");
  return memory;
}
export async function requireComparison(store: Store, token: string) {
  if (!token || token.length > 128)
    throw new AppError("This comparison was not found.", 404, "NOT_FOUND");
  const link = await store.findPerspectiveByComparisonHash(hashToken(token));
  if (!link)
    throw new AppError("This comparison was not found.", 404, "NOT_FOUND");
  if (!link.contributionPublicationId)
    throw new AppError(
      "The other perspective is not shared yet. Come back after both memories are ready.",
      409,
      "WAITING_FOR_PERSPECTIVE",
    );
  return link;
}
export async function authorizePublishedNarration(
  store: Store,
  memoryId: string,
  narrationId: string,
  capability: { share?: string; comparison?: string },
) {
  let publications: (PublicationSnapshot | null)[] = [];
  if (capability.comparison) {
    const link = await requireComparison(store, capability.comparison);
    publications = await Promise.all([
      store.getPublication(link.originalPublicationId),
      store.getPublication(link.contributionPublicationId!),
    ]);
  } else if (capability.share) {
    const memory = await requireShared(store, capability.share);
    if (memory.currentPublicationId)
      publications = [await store.getPublication(memory.currentPublicationId)];
  }
  if (
    !publications.some(
      (p) => p?.memoryId === memoryId && p.narrationId === narrationId,
    )
  )
    throw new AppError("This recording is not shared.", 403, "AUDIO_DENIED");
}
export async function publicationView(
  store: Store,
  publication: PublicationSnapshot,
  capability: { share?: string; comparison?: string } = {},
): Promise<PublicationView> {
  const version = (await store.versions(publication.memoryId)).find(
    (v) => v.id === publication.versionId,
  );
  if (!version)
    throw new AppError(
      "This published image is not available.",
      404,
      "NOT_FOUND",
    );
  let imageUrl = await store.imageUrl(
    version.imagePath,
    publication.memoryId,
    publication.versionId,
    capability.share,
  );
  if (imageUrl.startsWith("/") && capability.comparison)
    imageUrl += `${imageUrl.includes("?") ? "&" : "?"}comparison=${encodeURIComponent(capability.comparison)}`;
  let narration = null;
  if (publication.narrationId) {
    const record = await store.getNarration(publication.narrationId);
    if (!record || record.memoryId !== publication.memoryId)
      throw new AppError("This recording is not available.", 404, "NOT_FOUND");
    const { audioPath: _privatePath, ...safe } = record;
    void _privatePath;
    narration = { ...safe, audioUrl: await store.audioUrl(record, capability) };
  }
  const source = version.scene.outsideFrame
    ? (await store.versions(publication.memoryId)).find(
        (v) =>
          v.id === version.scene.outsideFrame?.sourceVersionId &&
          v.origin === "source" &&
          version.parentVersionId === v.id,
      )
    : null;
  const capabilityQuery = capability.comparison
    ? `comparison=${encodeURIComponent(capability.comparison)}`
    : capability.share
      ? `share=${encodeURIComponent(capability.share)}`
      : "";
  return {
    ...publication,
    imageUrl,
    narration,
    imageOrigin: version.origin ?? "generated",
    sourceImageUrl: source
      ? `/api/memories/${publication.memoryId}/images/${source.id}${capabilityQuery ? "?" + capabilityQuery : ""}`
      : undefined,
  };
}
