import { createConnectionSupabaseStore } from "./connection-supabase-store";
import type {
  Store,
  MemoryRecord,
  ImageVersion,
  MemoryMessage,
  GeneratedImage,
} from "../memory/types";
const memoryFields = {
  narrationId: "narration_id",
  currentPublicationId: "current_publication_id",
  id: "id",
  title: "title",
  authorName: "author_name",
  recipientName: "recipient_name",
  story: "story",
  scenePlan: "scene_plan",
  authorTokenHash: "author_token_hash",
  shareTokenHash: "share_token_hash",
  publishedVersionId: "published_version_id",
  publishedCaption: "published_caption",
  publishedTitle: "published_title",
  publishedAuthorName: "published_author_name",
  publishedRecipientName: "published_recipient_name",
  createdAt: "created_at",
} as const;
const versionFields = {
  id: "id",
  memoryId: "memory_id",
  parentVersionId: "parent_version_id",
  imagePath: "image_path",
  scene: "scene",
  instruction: "instruction",
  createdAt: "created_at",
} as const;
const messageFields = {
  id: "id",
  memoryId: "memory_id",
  versionId: "version_id",
  role: "role",
  displayName: "display_name",
  text: "text",
  publicationId: "publication_id",
  pinId: "pin_id",
  parentId: "parent_id",
  createdAt: "created_at",
} as const;
function encode(value: object, fields: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key in fields)
      .map(([key, v]) => [fields[key], v]),
  );
}
function decode<T>(
  value: Record<string, unknown>,
  fields: Record<string, string>,
): T {
  return Object.fromEntries(
    Object.entries(fields).map(([key, column]) => [key, value[column]]),
  ) as T;
}
function safePath(path: string) {
  if (
    !/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_.-]+)*$/.test(path) ||
    path.split("/").some((p) => p === "." || p === "..")
  )
    throw Object.assign(new Error("Invalid image path"), { status: 400 });
  return path.split("/").map(encodeURIComponent).join("/");
}
export function createSupabaseStore(
  url: string,
  key: string,
  bucket = "memory-images",
): Store {
  const base = url.replace(/\/$/, "").replace(/\/rest\/v1$/, "");
  async function request(path: string, init: RequestInit = {}) {
    const response = await fetch(`${base}${path}`, {
      ...init,
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        ...init.headers,
      },
      cache: "no-store",
    });
    if (!response.ok) {
      const detail = await response.text();
      const status = /cap reached/i.test(detail)
        ? 429
        : /not found/i.test(detail)
          ? 404
          : response.status === 400
            ? 409
            : response.status;
      throw Object.assign(new Error(detail || "Storage request failed"), {
        status,
      });
    }
    if (response.status === 204) return null;
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }
  const rpc = (name: string, data: object) =>
    request(`/rest/v1/rpc/${name}`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  const query = (table: string, filter: string) =>
    request(`/rest/v1/${table}?${filter}`);
  const filter = (key: string, value: string) =>
    `${key}=eq.${encodeURIComponent(value)}`;
  return {
    ...createConnectionSupabaseStore(url, key),
    async createMemory(m) {
      await request("/rest/v1/memories", {
        method: "POST",
        body: JSON.stringify(encode(m, memoryFields)),
      });
    },
    async getMemory(id) {
      const rows = await query("memories", filter("id", id));
      return rows[0] ? decode<MemoryRecord>(rows[0], memoryFields) : null;
    },
    async updateMemory(id, update) {
      if (update.id && update.id !== id)
        throw Object.assign(new Error("Cannot change memory ID"), {
          status: 400,
        });
      await rpc("update_memory", {
        p_memory_id: id,
        p_update: encode(update, memoryFields),
      });
    },
    async findShared(hash) {
      const rows = await query("memories", filter("share_token_hash", hash));
      return rows[0] ? decode<MemoryRecord>(rows[0], memoryFields) : null;
    },
    async versions(id) {
      return (
        await query(
          "memory_versions",
          `${filter("memory_id", id)}&order=created_at.asc`,
        )
      ).map((row: Record<string, unknown>) =>
        decode<ImageVersion>(row, versionFields),
      );
    },
    async messages(id) {
      return (
        await query(
          "messages",
          `${filter("memory_id", id)}&order=created_at.asc`,
        )
      ).map((row: Record<string, unknown>) =>
        decode<MemoryMessage>(row, messageFields),
      );
    },
    async addMessage(message, expected) {
      await rpc("add_memory_message", {
        p_message: encode(message, messageFields),
        p_expected_version: expected ?? null,
      });
    },
    async getRenderRequest(mid, rid) {
      const rows = await request(
        `/rest/v1/render_requests?memory_id=eq.${encodeURIComponent(mid)}&id=eq.${encodeURIComponent(rid)}&limit=1`,
      );
      const r = rows[0];
      return r
        ? {
            id: r.id,
            memoryId: r.memory_id,
            status: r.status,
            createdAt: r.created_at,
            expiresAt: r.expires_at,
            versionId: r.version_id,
          }
        : null;
    },
    async reserveRender(mid, rid, cap) {
      const result = await rpc("reserve_render", {
        p_memory_id: mid,
        p_request_id: rid,
        // Existing RPC takes an int cap. Its maximum value represents the
        // uncapped demo policy without a breaking schema migration.
        p_cap: cap ?? 2147483647,
      });
      return result.kind === "completed"
        ? {
            kind: "completed",
            version: decode<ImageVersion>(result.version, versionFields),
          }
        : { kind: "reserved" };
    },
    async completeRender(mid, rid, version) {
      await rpc("complete_render", {
        p_memory_id: mid,
        p_request_id: rid,
        p_version: encode(version, versionFields),
      });
    },
    async failRender(mid, rid) {
      await rpc("fail_render", { p_memory_id: mid, p_request_id: rid });
    },
    async putImage(path, image) {
      if (!["image/png", "image/jpeg", "image/webp"].includes(image.mimeType))
        throw Object.assign(new Error("Unsupported image type"), {
          status: 400,
        });
      const response = await fetch(
        `${base}/storage/v1/object/${encodeURIComponent(bucket)}/${safePath(path)}`,
        {
          method: "POST",
          headers: {
            apikey: key,
            Authorization: `Bearer ${key}`,
            "Content-Type": image.mimeType,
            "x-upsert": "false",
          },
          body: Buffer.from(image.bytes),
        },
      );
      if (!response.ok)
        throw new Error(`Image upload failed: ${await response.text()}`);
    },
    async readImage(path): Promise<GeneratedImage> {
      const response = await fetch(
        `${base}/storage/v1/object/authenticated/${encodeURIComponent(bucket)}/${safePath(path)}`,
        {
          headers: { apikey: key, Authorization: `Bearer ${key}` },
          cache: "no-store",
        },
      );
      if (!response.ok) throw new Error("Image not found");
      const mimeType = (response.headers.get("content-type") ?? "").split(
        ";",
      )[0];
      if (!["image/png", "image/jpeg", "image/webp"].includes(mimeType))
        throw new Error("Unsupported stored image type");
      return { bytes: new Uint8Array(await response.arrayBuffer()), mimeType };
    },
    async removeImage(path) {
      await request(`/storage/v1/object/${encodeURIComponent(bucket)}`, {
        method: "DELETE",
        body: JSON.stringify({ prefixes: [safePath(path)] }),
      });
    },
    async imageUrl(path) {
      const result = await request(
        `/storage/v1/object/sign/${encodeURIComponent(bucket)}/${safePath(path)}`,
        { method: "POST", body: JSON.stringify({ expiresIn: 900 }) },
      );
      const signed = result.signedURL ?? result.signedUrl;
      if (typeof signed !== "string")
        throw new Error("Missing signed image URL");
      return signed.startsWith("http") ? signed : `${base}/storage/v1${signed}`;
    },
  };
}
