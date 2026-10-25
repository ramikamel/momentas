import { randomUUID } from "node:crypto";
import sharp from "sharp";
import type { Store } from "../memory/types";
import type { AuthorAuth } from "../memory/connections";
import type { MemoryReference, ReferenceView } from "../memory/personalization";
import { AppError } from "./access";
import { requireAuthor } from "./authorization";

export const REFERENCE_UPLOAD_LIMIT = 3 * 1024 * 1024;
export function referenceView(record: MemoryReference): ReferenceView {
  const { imagePath: _, ...view } = record;
  void _;
  return {
    ...view,
    imageUrl: `/api/memories/${record.memoryId}/references/${record.id}/image`,
  };
}
export async function referenceForm(request: Request): Promise<FormData> {
  const type = request.headers.get("content-type") || "";
  if (!type.startsWith("multipart/form-data"))
    throw new AppError("Choose a photo to upload.");
  const reader = request.body?.getReader();
  if (!reader) throw new AppError("Choose a photo to upload.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > REFERENCE_UPLOAD_LIMIT) {
        await reader.cancel();
        throw new AppError("Photo upload must be smaller than 3 MB.", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return await new Response(Buffer.concat(chunks), {
      headers: { "content-type": type },
    }).formData();
  } catch {
    throw new AppError("Provide a valid photo upload.");
  }
}
export class ReferenceService {
  constructor(private store: Store) {}
  async list(auth: AuthorAuth): Promise<ReferenceView[]> {
    await requireAuthor(this.store, auth);
    return (await this.store.references(auth.memoryId)).map(referenceView);
  }
  async upload(
    auth: AuthorAuth,
    file: File,
    labelInput: unknown,
    kindInput: unknown,
  ): Promise<ReferenceView> {
    await requireAuthor(this.store, auth);
    const label = typeof labelInput === "string" ? labelInput.trim() : "";
    if (!label || label.length > 80)
      throw new AppError("Name this photo using 1–80 characters.");
    // Legacy storage requires a category; new uploads only need an image and name.
    const kind = kindInput == null ? "object" : kindInput;
    if (kind !== "person" && kind !== "place" && kind !== "object")
      throw new AppError("Choose person, place, or object.");
    if (
      !(file instanceof File) ||
      !["image/jpeg", "image/png", "image/webp"].includes(file.type)
    )
      throw new AppError("Choose a JPEG, PNG, or WebP photo.");
    if (!file.size || file.size > REFERENCE_UPLOAD_LIMIT)
      throw new AppError("Photo upload must be smaller than 3 MB.", 413);
    const existing = await this.store.references(auth.memoryId);
    if (existing.length >= 4)
      throw new AppError("You can add up to four reference photos.", 409);
    if (existing.some((r) => r.label.toLowerCase() === label.toLowerCase()))
      throw new AppError("Give each reference photo a different name.", 409);
    let bytes: Buffer;
    try {
      const input = Buffer.from(await file.arrayBuffer());
      const metadata = await sharp(input, {
        limitInputPixels: 20_000_000,
        animated: false,
      }).metadata();
      if (
        !metadata.format ||
        !["jpeg", "png", "webp"].includes(metadata.format) ||
        !metadata.width ||
        !metadata.height ||
        metadata.width * metadata.height > 20_000_000 ||
        (metadata.pages ?? 1) > 1
      )
        throw new Error("Invalid format");
      bytes = await sharp(input, { limitInputPixels: 20_000_000 })
        .rotate()
        .resize({
          width: 1536,
          height: 1536,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 85 })
        .toBuffer();
    } catch {
      throw new AppError(
        "Choose a valid JPEG, PNG, or WebP photo up to 20 megapixels.",
      );
    }
    const id = randomUUID();
    const record: MemoryReference = {
      id,
      memoryId: auth.memoryId,
      label,
      kind,
      imagePath: `${auth.memoryId}/references/${id}.webp`,
      createdAt: new Date().toISOString(),
    };
    await this.store.putImage(record.imagePath, {
      bytes,
      mimeType: "image/webp",
    });
    try {
      await this.store.saveReference(record);
    } catch (error) {
      await this.store.removeImage(record.imagePath).catch(() => {});
      throw error;
    }
    return referenceView(record);
  }
  async remove(auth: AuthorAuth, id: string): Promise<void> {
    await requireAuthor(this.store, auth);
    const record = (await this.store.references(auth.memoryId)).find(
      (r) => r.id === id,
    );
    if (!record) throw new AppError("Reference photo not found.", 404);
    await this.store.deleteReference(auth.memoryId, id);
    await this.store.removeImage(record.imagePath);
  }
  async image(auth: AuthorAuth, id: string) {
    await requireAuthor(this.store, auth);
    const record = (await this.store.references(auth.memoryId)).find(
      (r) => r.id === id,
    );
    if (!record) throw new AppError("Reference photo not found.", 404);
    return this.store.readImage(record.imagePath);
  }
}
