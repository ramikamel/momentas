import { randomUUID } from "node:crypto";
import sharp from "sharp";
import type { Store } from "@/lib/memory/types";
import {
  referenceKindSchema,
  referenceNameSchema,
  type VisualReference,
  type VisualReferenceView,
} from "@/lib/memory/references";
import { AppError } from "./access";
import { requireAuthor } from "./authorization";
import type { AuthorAuth } from "@/lib/memory/connections";

const maxReferences = 4;
const maxUpload = 6 * 1024 * 1024;

function view(memoryId: string, reference: VisualReference): VisualReferenceView {
  return {
    id: reference.id,
    name: reference.name,
    kind: reference.kind,
    imageUrl: `/api/memories/${memoryId}/references/${reference.id}`,
  };
}

export class ReferenceService {
  constructor(private store: Store) {}
  async list(auth: AuthorAuth): Promise<VisualReferenceView[]> {
    await requireAuthor(this.store, auth);
    return (await this.store.listVisualReferences(auth.memoryId)).map((item) =>
      view(auth.memoryId, item),
    );
  }
  async add(
    auth: AuthorAuth,
    input: { name: string; kind: string; bytes: Uint8Array },
  ): Promise<VisualReferenceView> {
    await requireAuthor(this.store, auth);
    const name = referenceNameSchema.safeParse(input.name);
    const kind = referenceKindSchema.safeParse(input.kind);
    if (!name.success)
      throw new AppError("Use a short name such as Dad or our kitchen.", 400);
    if (!kind.success)
      throw new AppError("Choose whether this picture is a person or a place.", 400);
    if (input.bytes.byteLength > maxUpload)
      throw new AppError("That picture is too large.", 413);
    const existing = await this.store.listVisualReferences(auth.memoryId);
    if (existing.length >= maxReferences)
      throw new AppError("You can add up to four reference pictures.", 409);
    let stored: { bytes: Buffer; mimeType: "image/jpeg" };
    try {
      const bytes = await sharp(Buffer.from(input.bytes), {
        limitInputPixels: 20000000,
      })
        .rotate()
        .resize({
          width: 1024,
          height: 1024,
          fit: "inside",
          withoutEnlargement: true,
        })
        .jpeg({ quality: 82 })
        .toBuffer();
      stored = { bytes, mimeType: "image/jpeg" };
    } catch {
      throw new AppError("Use a JPEG, PNG, or WebP picture.", 400);
    }
    const id = randomUUID();
    const reference: VisualReference = {
      id,
      memoryId: auth.memoryId,
      name: name.data,
      kind: kind.data,
      imagePath: `refs/${auth.memoryId}/${id}.jpg`,
      createdAt: new Date().toISOString(),
    };
    await this.store.putImage(reference.imagePath, stored);
    try {
      await this.store.saveVisualReference(reference);
    } catch (e) {
      await this.store.removeImage(reference.imagePath).catch(() => {});
      const status = (e as { status?: number }).status;
      if (status === 503)
        throw new AppError(
          e instanceof Error
            ? e.message
            : "Picture references need the latest database update before they can be saved.",
          503,
        );
      throw e;
    }
    return view(auth.memoryId, reference);
  }
  async read(auth: AuthorAuth, referenceId: string) {
    await requireAuthor(this.store, auth);
    const reference = (await this.store.listVisualReferences(auth.memoryId)).find(
      (item) => item.id === referenceId,
    );
    if (!reference || !reference.imagePath.startsWith(`refs/${auth.memoryId}/`))
      throw new AppError("Picture not found.", 404);
    return this.store.readImage(reference.imagePath);
  }
  async remove(auth: AuthorAuth, referenceId: string) {
    await requireAuthor(this.store, auth);
    const reference = (await this.store.listVisualReferences(auth.memoryId)).find(
      (item) => item.id === referenceId,
    );
    if (!reference) throw new AppError("Picture not found.", 404);
    await this.store.removeVisualReference(auth.memoryId, referenceId);
    await this.store.removeImage(reference.imagePath).catch(() => {});
  }
}

export async function referenceImages(store: Store, memoryId: string) {
  const references = await store.listVisualReferences(memoryId);
  return Promise.all(
    references.map(async (reference) => ({
      name: reference.name,
      kind: reference.kind,
      image: await store.readImage(reference.imagePath),
    })),
  );
}
