import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { dirname } from "node:path";
import type {
  SourcePhoto,
  SourcePhotoStore,
  SourceUpload,
} from "../memory/source-photo";
import type { ImageVersion } from "../memory/types";
export type SourceState = {
  sourceUploads?: SourceUpload[];
  sourcePhotos?: SourcePhoto[];
  versions: ImageVersion[];
};
function conflict(message: string, status = 409): never {
  throw Object.assign(new Error(message), { status });
}
export function createSourcePhotoLocalStore<S extends SourceState>(
  transaction: <T>(fn: (s: S) => T | Promise<T>, save?: boolean) => Promise<T>,
  path: (p: string) => string,
): SourcePhotoStore {
  const find = (s: S, mid: string, id: string) =>
    s.sourceUploads?.find((u) => u.id === id && u.memoryId === mid) ??
    conflict("Upload not found", 404);
  return {
    expiredSourceUploads: (mid, before) =>
      transaction(
        (s) =>
          (s.sourceUploads ?? []).filter(
            (u) =>
              u.memoryId === mid &&
              u.expiresAt < before &&
              u.status !== "ready" &&
              !(s.sourcePhotos ?? []).some(
                (p) =>
                  p.originalPath === u.originalPath || p.versionId === u.id,
              ),
          ),
        false,
      ),
    async removeSource(p) {
      await unlink(path(p)).catch((e) => {
        if (e.code !== "ENOENT") throw e;
      });
    },
    createSourceUpload: (u) =>
      transaction((s) => {
        (s.sourceUploads ??= []).push(u);
      }),
    getSourceUpload: (mid, id) =>
      transaction(
        (s) =>
          s.sourceUploads?.find((u) => u.id === id && u.memoryId === mid) ??
          null,
        false,
      ),
    claimSourceUpload: (mid, id, claimId) =>
      transaction((s) => {
        const u = find(s, mid, id);
        if (u.status === "ready") return u;
        if (u.expiresAt < Date.now()) conflict("Upload expired");
        if (u.status === "validating" && (u.claimExpiresAt ?? 0) > Date.now())
          conflict("Upload pending");
        u.status = "validating";
        u.claimId = claimId;
        u.claimExpiresAt = Date.now() + 120000;
        return u;
      }),
    finishSourceUpload: (mid, id, claimId, source, version) =>
      transaction((s) => {
        const u = find(s, mid, id);
        if (u.status === "ready") return u.version!;
        if (
          u.claimId !== claimId ||
          u.status !== "validating" ||
          (u.claimExpiresAt ?? 0) <= Date.now()
        )
          conflict("Claim expired");
        if (
          source.memoryId !== mid ||
          version.memoryId !== mid ||
          source.id !== id ||
          version.id !== id ||
          source.versionId !== id ||
          source.originalPath !== u.originalPath ||
          source.displayPath !== version.imagePath ||
          version.origin !== "source"
        )
          conflict("Invalid source");
        if (s.sourcePhotos?.some((p) => p.memoryId === mid))
          conflict("Source already exists");
        (s.sourcePhotos ??= []).push(source);
        s.versions.push(version);
        u.status = "ready";
        u.source = source;
        u.version = version;
        return version;
      }),
    failSourceUpload: (mid, id, claimId) =>
      transaction((s) => {
        const u = find(s, mid, id);
        if (u.status === "validating" && u.claimId === claimId)
          u.status = "failed";
      }),
    getSourcePhoto: (mid) =>
      transaction(
        (s) => s.sourcePhotos?.find((p) => p.memoryId === mid) ?? null,
        false,
      ),
    async sourceUploadUrl(u) {
      return {
        uploadUrl: `/api/memories/${u.memoryId}/source/upload/${u.id}`,
        method: "PUT",
        headers: { "Content-Type": u.mimeType },
      };
    },
    async putSource(p, image) {
      const target = path(p);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(
        target,
        JSON.stringify({
          mimeType: image.mimeType,
          bytes: Buffer.from(image.bytes).toString("base64"),
        }),
        { mode: 0o600, flag: "wx" },
      );
    },
    async readSource(p) {
      const data = JSON.parse(await readFile(path(p), "utf8"));
      return {
        mimeType: data.mimeType,
        bytes: new Uint8Array(Buffer.from(data.bytes, "base64")),
      };
    },
  };
}
