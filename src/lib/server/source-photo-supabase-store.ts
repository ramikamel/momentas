import type { SourcePhotoStore, SourceUpload } from "../memory/source-photo";
export function createSourcePhotoSupabaseStore(
  url: string,
  key: string,
): SourcePhotoStore {
  const base = url.replace(/\/$/, "").replace(/\/rest\/v1$/, "");
  async function request(path: string, init: RequestInit = {}) {
    const r = await fetch(`${base}${path}`, {
      ...init,
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        ...init.headers,
      },
      cache: "no-store",
    });
    if (!r.ok)
      throw Object.assign(new Error("Source storage request failed"), {
        status: r.status === 400 ? 409 : r.status,
      });
    if (r.status === 204) return null;
    const text = await r.text();
    return text ? JSON.parse(text) : null;
  }
  const rpc = (action: string, data: object) =>
    request(`/rest/v1/rpc/source_${action}`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  const storagePath = (path: string) =>
    path.split("/").map(encodeURIComponent).join("/");
  return {
    expiredSourceUploads: (mid, before) =>
      rpc("expired", { p_mid: mid, p_before: before }),
    async removeSource(path) {
      await request(`/storage/v1/object/memory-sources`, {
        method: "DELETE",
        body: JSON.stringify({ prefixes: [path] }),
      });
    },
    async createSourceUpload(u) {
      await request("/rest/v1/source_uploads", {
        method: "POST",
        body: JSON.stringify({ id: u.id, memory_id: u.memoryId, record: u }),
      });
    },
    async getSourceUpload(mid, id) {
      const rows = await request(
        `/rest/v1/source_uploads?id=eq.${encodeURIComponent(id)}&memory_id=eq.${encodeURIComponent(mid)}`,
      );
      return rows[0]?.record ?? null;
    },
    claimSourceUpload: (mid, id, claimId) =>
      rpc("claim", { p_mid: mid, p_id: id, p_claim: claimId }),
    finishSourceUpload: (mid, id, claimId, source, version) =>
      rpc("finish", {
        p_mid: mid,
        p_id: id,
        p_claim: claimId,
        p_source: source,
        p_version: version,
      }),
    async failSourceUpload(mid, id, claimId) {
      await rpc("fail", { p_mid: mid, p_id: id, p_claim: claimId });
    },
    async getSourcePhoto(mid) {
      const rows = await request(
        `/rest/v1/source_photos?memory_id=eq.${encodeURIComponent(mid)}`,
      );
      return rows[0]?.record ?? null;
    },
    async sourceUploadUrl(u: SourceUpload) {
      const result = await request(
        `/storage/v1/object/upload/sign/memory-sources/${storagePath(u.originalPath)}`,
        { method: "POST", body: "{}" },
      );
      const signed = result.url ?? result.signedURL ?? result.signedUrl;
      if (typeof signed !== "string")
        throw new Error("Missing signed upload URL");
      return {
        uploadUrl: signed.startsWith("http")
          ? signed
          : `${base}/storage/v1${signed}`,
        method: "PUT",
        headers: { "Content-Type": u.mimeType, "x-upsert": "false" },
      };
    },
    async putSource(path, image) {
      await request(`/storage/v1/object/memory-sources/${storagePath(path)}`, {
        method: "POST",
        headers: { "Content-Type": image.mimeType, "x-upsert": "false" },
        body: Buffer.from(image.bytes),
      });
    },
    async readSource(path) {
      const r = await fetch(
        `${base}/storage/v1/object/authenticated/memory-sources/${storagePath(path)}`,
        {
          headers: { apikey: key, Authorization: `Bearer ${key}` },
          cache: "no-store",
        },
      );
      if (!r.ok)
        throw Object.assign(new Error("Source upload unavailable"), {
          status: r.status === 404 ? 409 : r.status,
        });
      const size = Number(r.headers.get("content-length") ?? 0);
      if (size > 12 * 1024 * 1024)
        throw Object.assign(new Error("Source too large"), { status: 413 });
      const reader = r.body?.getReader();
      if (!reader) throw new Error("Missing source bytes");
      const chunks: Uint8Array[] = [];
      let total = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.length;
        if (total > 12 * 1024 * 1024) {
          await reader.cancel();
          throw Object.assign(new Error("Source too large"), { status: 413 });
        }
        chunks.push(value);
      }
      return {
        bytes: Buffer.concat(chunks),
        mimeType: r.headers.get("content-type") ?? "application/octet-stream",
      };
    },
  };
}
