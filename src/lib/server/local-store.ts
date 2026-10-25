import {
  mkdir,
  readFile,
  rename,
  writeFile,
  unlink,
  link,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import type {
  Store,
  MemoryRecord,
  ImageVersion,
  MemoryMessage,
  RenderRequest,
} from "../memory/types";
type State = {
  memories: MemoryRecord[];
  versions: ImageVersion[];
  messages: MemoryMessage[];
  requests: RenderRequest[];
};
const locks = new Map<string, Promise<unknown>>();
function error(message: string, status = 409): never {
  throw Object.assign(new Error(message), { status });
}
const mimes = new Set(["image/png", "image/jpeg", "image/webp"]);
export function createLocalStore(directory: string): Store {
  const root = resolve(directory),
    file = join(root, "data.json");
  async function transaction<T>(
    fn: (state: State) => T | Promise<T>,
    save = true,
  ): Promise<T> {
    const previous = locks.get(root) ?? Promise.resolve();
    const operation = previous
      .catch(() => {})
      .then(async () => {
        await mkdir(root, { recursive: true });
        let state: State;
        try {
          state = JSON.parse(await readFile(file, "utf8"));
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
          state = { memories: [], versions: [], messages: [], requests: [] };
        }
        const result = await fn(state);
        if (save) {
          const temporary = `${file}.${randomUUID()}.tmp`;
          await writeFile(temporary, JSON.stringify(state), { mode: 0o600 });
          await rename(temporary, file);
        }
        return structuredClone(result);
      });
    locks.set(root, operation);
    return operation;
  }
  function imagePath(path: string) {
    if (
      !/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_.-]+)*$/.test(path) ||
      path.split("/").some((x) => x === "." || x === "..")
    )
      error("Invalid image path", 400);
    return join(root, "images", path);
  }
  function memory(s: State, id: string) {
    return (
      s.memories.find((m) => m.id === id) ?? error("Memory not found", 404)
    );
  }
  function ownVersion(s: State, id: string, mid: string) {
    return (
      s.versions.find((v) => v.id === id && v.memoryId === mid) ??
      error("Version not found", 404)
    );
  }
  return {
    createMemory: (m) =>
      transaction((s) => {
        if (s.memories.some((x) => x.id === m.id))
          error("Memory already exists");
        s.memories.push(structuredClone(m));
      }),
    getMemory: (id) =>
      transaction((s) => s.memories.find((m) => m.id === id) ?? null, false),
    updateMemory: (id, update) =>
      transaction((s) => {
        const m = memory(s, id);
        if (update.id && update.id !== id)
          error("Cannot change memory ID", 400);
        if (update.publishedVersionId)
          ownVersion(s, update.publishedVersionId, id);
        Object.assign(m, structuredClone(update), { id });
      }),
    findShared: (hash) =>
      transaction(
        (s) => s.memories.find((m) => m.shareTokenHash === hash) ?? null,
        false,
      ),
    versions: (id) =>
      transaction((s) => s.versions.filter((v) => v.memoryId === id), false),
    messages: (id) =>
      transaction((s) => s.messages.filter((v) => v.memoryId === id), false),
    addMessage: (message, expected) =>
      transaction((s) => {
        const m = memory(s, message.memoryId);
        if (expected !== undefined && m.publishedVersionId !== expected)
          error("Published version changed");
        ownVersion(s, message.versionId, message.memoryId);
        if (
          message.parentId &&
          !s.messages.some(
            (x) =>
              x.id === message.parentId &&
              x.memoryId === message.memoryId &&
              x.versionId === message.versionId,
          )
        )
          error("Parent message not found", 404);
        if (s.messages.some((x) => x.id === message.id))
          error("Message already exists");
        s.messages.push(structuredClone(message));
      }),
    reserveRender: (mid, rid, cap) =>
      transaction((s) => {
        memory(s, mid);
        const existing = s.requests.find((r) => r.id === rid);
        if (existing) {
          if (existing.memoryId !== mid)
            error("Request belongs to another memory");
          if (existing.status === "complete" && existing.versionId)
            return {
              kind: "completed" as const,
              version: ownVersion(s, existing.versionId, mid),
            };
          error("Request already used");
        }
        if (
          s.requests.some(
            (r) =>
              r.memoryId === mid &&
              r.status === "pending" &&
              Date.parse(r.expiresAt) > Date.now(),
          )
        )
          error("Render already pending");
        if (!Number.isInteger(cap) || cap < 1 || s.requests.length >= cap)
          error("Image request cap reached", 429);
        const now = Date.now();
        s.requests.push({
          id: rid,
          memoryId: mid,
          status: "pending",
          createdAt: new Date(now).toISOString(),
          expiresAt: new Date(now + 300000).toISOString(),
          versionId: null,
        });
        return { kind: "reserved" as const };
      }),
    completeRender: (mid, rid, version) =>
      transaction((s) => {
        const r = s.requests.find((r) => r.id === rid && r.memoryId === mid);
        if (
          !r ||
          r.status !== "pending" ||
          Date.parse(r.expiresAt) <= Date.now()
        )
          error("Render reservation expired or inactive");
        if (version.memoryId !== mid)
          error("Version belongs to another memory");
        if (
          s.versions.some(
            (v) => v.id === version.id || v.imagePath === version.imagePath,
          )
        )
          error("Version already exists");
        if (version.parentVersionId)
          ownVersion(s, version.parentVersionId, mid);
        s.versions.push(structuredClone(version));
        r.status = "complete";
        r.versionId = version.id;
      }),
    failRender: (mid, rid) =>
      transaction((s) => {
        const r = s.requests.find((r) => r.id === rid && r.memoryId === mid);
        if (r?.status === "pending") r.status = "failed";
      }),
    async putImage(path, image) {
      const target = imagePath(path);
      if (!mimes.has(image.mimeType)) error("Unsupported image type", 400);
      await mkdir(join(target, ".."), { recursive: true });
      const temporary = `${target}.${randomUUID()}.tmp`;
      await writeFile(
        temporary,
        JSON.stringify({
          mimeType: image.mimeType,
          bytes: Buffer.from(image.bytes).toString("base64"),
        }),
        { mode: 0o600 },
      );
      try {
        await link(temporary, target);
      } finally {
        await unlink(temporary);
      }
    },
    async readImage(path) {
      const stored = JSON.parse(await readFile(imagePath(path), "utf8"));
      if (!mimes.has(stored.mimeType))
        error("Unsupported stored image type", 500);
      return {
        mimeType: stored.mimeType,
        bytes: new Uint8Array(Buffer.from(stored.bytes, "base64")),
      };
    },
    async removeImage(path) {
      await unlink(imagePath(path)).catch((e) => {
        if (e.code !== "ENOENT") throw e;
      });
    },
    async imageUrl(path, mid, vid, token) {
      imagePath(path);
      return `/api/memories/${encodeURIComponent(mid)}/images/${encodeURIComponent(vid)}${token ? `?share=${encodeURIComponent(token)}` : ""}`;
    },
  };
}
