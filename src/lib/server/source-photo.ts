import { createHash, randomUUID } from "node:crypto";
import sharp from "sharp";
import type { Store, ImageVersion, ImageVersionView } from "../memory/types";
import type { AuthorAuth } from "../memory/connections";
import { AppError } from "./access";
import { requireAuthor } from "./authorization";
export const SOURCE_LIMIT = 12 * 1024 * 1024;
const formats: Record<string, string> = {
  "image/jpeg": "jpeg",
  "image/png": "png",
  "image/webp": "webp",
};
export class SourcePhotoService {
  constructor(private store: Store) {}
  async initiate(
    auth: AuthorAuth,
    input: { name: string; mimeType: string; size: number },
  ) {
    await requireAuthor(this.store, auth);
    if (
      !input ||
      !formats[input.mimeType] ||
      typeof input.name !== "string" ||
      !input.name.trim() ||
      input.name.length > 255
    )
      throw new AppError("Choose a JPEG, PNG or WebP photograph.");
    if (
      !Number.isInteger(input.size) ||
      input.size < 1 ||
      input.size > SOURCE_LIMIT
    )
      throw new AppError("Photographs must be at most 12 MiB.", 413);
    if (await this.store.getSourcePhoto(auth.memoryId))
      throw new AppError("This memory already has a source photograph.", 409);
    const id = randomUUID(),
      upload = {
        id,
        memoryId: auth.memoryId,
        originalPath: `${auth.memoryId}/${id}/original`,
        mimeType: input.mimeType,
        size: input.size,
        status: "pending" as const,
        expiresAt: Date.now() + 3600000,
      };
    await this.store.createSourceUpload(upload);
    return { uploadId: id, ...(await this.store.sourceUploadUrl(upload)) };
  }
  async upload(auth: AuthorAuth, id: string, bytes: Uint8Array) {
    await requireAuthor(this.store, auth);
    const u = await this.store.getSourceUpload(auth.memoryId, id);
    if (!u) throw new AppError("Upload not found.", 404);
    if (u.status !== "pending" || u.expiresAt <= Date.now())
      throw new AppError("Upload expired or already used.", 409);
    if (bytes.length !== u.size || bytes.length > SOURCE_LIMIT)
      throw new AppError("Upload size does not match.", 413);
    await this.store.putSource(u.originalPath, { bytes, mimeType: u.mimeType });
  }
  private async view(version: ImageVersion): Promise<ImageVersionView> {
    return {
      ...version,
      imageUrl: await this.store.imageUrl(
        version.imagePath,
        version.memoryId,
        version.id,
      ),
    };
  }
  async complete(auth: AuthorAuth, id: string): Promise<ImageVersionView> {
    await requireAuthor(this.store, auth);
    const claimId = randomUUID(),
      u = await this.store.claimSourceUpload(auth.memoryId, id, claimId);
    if (u.status === "ready") return this.view(u.version!);
    try {
      const original = await this.store.readSource(u.originalPath);
      if (
        original.bytes.length !== u.size ||
        original.bytes.length > SOURCE_LIMIT
      )
        throw new AppError("Upload size does not match.", 413);
      let display: Buffer, width: number, height: number;
      try {
        const metadata = await sharp(original.bytes, {
          limitInputPixels: 24000000,
          animated: true,
        }).metadata();
        if (
          metadata.format !== formats[u.mimeType] ||
          !metadata.width ||
          !metadata.height ||
          metadata.width * metadata.height > 24000000 ||
          (metadata.pages ?? 1) > 1
        )
          throw new Error("Invalid photograph");
        const result = await sharp(original.bytes, {
          limitInputPixels: 24000000,
        })
          .rotate()
          .resize({
            width: 2048,
            height: 2048,
            fit: "inside",
            withoutEnlargement: true,
          })
          .webp({ quality: 90 })
          .toBuffer({ resolveWithObject: true });
        display = result.data;
        width = result.info.width;
        height = result.info.height;
      } catch {
        throw new AppError(
          "Choose a complete, still JPEG, PNG or WebP photograph up to 24 megapixels.",
        );
      }
      const versionId = u.id,
        displayPath = `${auth.memoryId}/source-${u.id}.webp`;
      // Deterministic display path survives a metadata commit failure. Never delete accepted or competing assets.
      try {
        await this.store.readImage(displayPath);
      } catch {
        await this.store.putImage(displayPath, {
          bytes: display,
          mimeType: "image/webp",
        });
      }
      const version: ImageVersion = {
        id: versionId,
        memoryId: auth.memoryId,
        parentVersionId: null,
        imagePath: displayPath,
        origin: "source",
        scene: {
          plan: {
            setting: null,
            people: [],
            details: [],
            perspective: null,
            feelings: [],
            followUpQuestions: [],
          },
          authorAdditions: "",
          confirmed: true,
        },
        instruction: null,
        createdAt: new Date().toISOString(),
      };
      const source = {
        id: u.id,
        memoryId: auth.memoryId,
        versionId,
        originalPath: u.originalPath,
        displayPath,
        mimeType: u.mimeType,
        sha256: createHash("sha256").update(original.bytes).digest("hex"),
        width,
        height,
      };
      return this.view(
        await this.store.finishSourceUpload(
          auth.memoryId,
          id,
          claimId,
          source,
          version,
        ),
      );
    } catch (error) {
      await this.store
        .failSourceUpload(auth.memoryId, id, claimId)
        .catch(() => {});
      throw error;
    }
  }
  async cleanup(auth: AuthorAuth) {
    await requireAuthor(this.store, auth);
    // Expiry is immutable: these uploads can no longer acquire or complete a claim.
    const expired = await this.store.expiredSourceUploads(
      auth.memoryId,
      Date.now() - 24 * 3600000,
    );
    for (const u of expired) {
      await this.store.removeSource(u.originalPath);
      await this.store.removeImage(`${auth.memoryId}/source-${u.id}.webp`);
    }
  }
  async getDisplay(auth: AuthorAuth) {
    await requireAuthor(this.store, auth);
    const source = await this.store.getSourcePhoto(auth.memoryId);
    if (!source) throw new AppError("Source photograph not found.", 404);
    return this.store.readImage(source.displayPath);
  }
}
