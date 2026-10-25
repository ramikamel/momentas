import type { Store } from "@/lib/memory/types";
import type { AuthorAuth } from "@/lib/memory/connections";
import { normalizePins } from "@/lib/memory/pins";
import { AppError } from "./access";
import { requireAuthor } from "./authorization";
export class PinService {
  constructor(private store: Store) {}
  async save(auth: AuthorAuth, versionId: string, raw: unknown) {
    await requireAuthor(this.store, auth);
    const version = (await this.store.versions(auth.memoryId)).find(
      (v) => v.id === versionId,
    );
    if (!version) throw new AppError("Image not found.", 404);
    let pins;
    try {
      pins = normalizePins(version.scene, raw);
    } catch {
      throw new AppError(
        "Add up to five details with a note of 1–500 characters and a position on this image.",
        400,
        "INVALID_PINS",
      );
    }
    await this.store.saveVersionPins(auth.memoryId, versionId, pins);
    return pins;
  }
}
