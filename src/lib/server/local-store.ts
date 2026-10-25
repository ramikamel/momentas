import { normalizePins } from "../memory/pins";
import type {
  PublicationSnapshot,
  NarrationRecord,
  PinDraft,
  PerspectiveLink,
  ConnectionRequest,
} from "../memory/connections";
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
  outlineRequests?: {
    id: string;
    memoryId: string;
    versionId: string;
    status: "pending" | "complete" | "failed";
    expiresAt: number;
  }[];
  publications: PublicationSnapshot[];
  narrations: NarrationRecord[];
  pins: Record<string, PinDraft[]>;
  links: PerspectiveLink[];
  connectionRequests: ConnectionRequest[];
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
          state = {
            memories: [],
            versions: [],
            messages: [],
            requests: [],
            publications: [],
            narrations: [],
            pins: {},
            links: [],
            connectionRequests: [],
          };
        }
        state.publications ??= [];
        state.narrations ??= [];
        state.pins ??= {};
        state.links ??= [];
        state.connectionRequests ??= [];
        for (const m of state.memories) {
          m.narrationId ??= null;
          m.currentPublicationId ??= null;
          if (m.publishedVersionId && !m.currentPublicationId) {
            const p = {
              id: randomUUID(),
              memoryId: m.id,
              versionId: m.publishedVersionId,
              title: m.publishedTitle,
              authorName: m.publishedAuthorName,
              recipientName: m.publishedRecipientName,
              caption: m.publishedCaption,
              pins: [],
              narrationId: null,
              createdAt: m.createdAt,
            };
            state.publications.push(p);
            m.currentPublicationId = p.id;
          }
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
  function imagePath(path: string, area = "images") {
    if (
      !/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_.-]+)*$/.test(path) ||
      path.split("/").some((x) => x === "." || x === "..")
    )
      error("Invalid image path", 400);
    return join(root, area, path);
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
  function narration(s: State, id: string) {
    return (
      s.narrations.find((n) => n.id === id) ?? error("Narration not found", 404)
    );
  }
  function relation(s: State, id: string) {
    return (
      s.links.find((l) => l.id === id) ?? error("Perspective not found", 404)
    );
  }
  function publication(s: State, id: string) {
    return (
      s.publications.find((p) => p.id === id) ??
      error("Publication not found", 404)
    );
  }
  return {
    reserveDetailOutline: (mid, vid, rid) =>
      transaction((s) => {
        ownVersion(s, vid, mid);
        const requests = (s.outlineRequests ??= []);
        if (requests.some((r) => r.id === rid))
          error("Outline request already used", 409);
        if (
          requests.length >= 120 ||
          requests.filter((r) => r.versionId === vid).length >= 20
        )
          error("Outline request cap reached", 429);
        if (
          requests.some(
            (r) =>
              r.versionId === vid &&
              r.status === "pending" &&
              r.expiresAt > Date.now(),
          )
        )
          error("Outline already pending", 409);
        requests.push({
          id: rid,
          memoryId: mid,
          versionId: vid,
          status: "pending",
          expiresAt: Date.now() + 120000,
        });
      }),
    finishDetailOutline: (mid, vid, rid, success) =>
      transaction((s) => {
        const r = s.outlineRequests?.find(
          (r) =>
            r.id === rid &&
            r.memoryId === mid &&
            r.versionId === vid &&
            r.status === "pending",
        );
        if (r) r.status = success ? "complete" : "failed";
      }),
    publishSnapshot: (mid, input) =>
      transaction((s) => {
        const m = memory(s, mid);
        ownVersion(s, input.versionId, mid);
        const n =
          input.includeNarration && m.narrationId
            ? narration(s, m.narrationId)
            : null;
        if (n && n.memoryId !== mid)
          error("Narration belongs to another memory");
        const p: PublicationSnapshot = {
          id: randomUUID(),
          memoryId: mid,
          versionId: input.versionId,
          title: m.title,
          authorName: m.authorName,
          recipientName: m.recipientName,
          caption: input.caption,
          pins: (s.pins[`${mid}/${input.versionId}`] ?? []).map(
            ({ id, x, y, label, sourceQuote, origin, outline }) => ({
              id,
              x,
              y,
              label,
              sourceQuote,
              ...(origin ? { origin } : {}),
              ...(outline ? { outline } : {}),
            }),
          ),
          narrationId: n?.id ?? null,
          createdAt: new Date().toISOString(),
        };
        s.publications.push(structuredClone(p));
        Object.assign(m, {
          currentPublicationId: p.id,
          publishedVersionId: p.versionId,
          publishedCaption: p.caption,
          publishedTitle: p.title,
          publishedAuthorName: p.authorName,
          publishedRecipientName: p.recipientName,
          shareTokenHash: input.shareTokenHash,
        });
        return p;
      }),
    getPublication: (id) =>
      transaction((s) => s.publications.find((p) => p.id === id) ?? null),
    getVersionPins: (mid, vid) =>
      transaction((s) => {
        ownVersion(s, vid, mid);
        return s.pins[`${mid}/${vid}`] ?? [];
      }),
    saveVersionPins: (mid, vid, pins) =>
      transaction((s) => {
        const v = ownVersion(s, vid, mid);
        if (
          pins.length > 5 ||
          new Set(pins.map((p) => p.id)).size !== pins.length
        )
          error("Invalid pins", 400);
        let validated: PinDraft[];
        try {
          validated = normalizePins(v.scene, pins);
        } catch {
          error("Invalid pin", 400);
        }
        s.pins[`${mid}/${vid}`] = structuredClone(validated!);
      }),
    saveNarration: (n) =>
      transaction((s) => {
        memory(s, n.memoryId);
        imagePath(n.audioPath, "audio");
        if (
          s.narrations.some((x) => x.id === n.id || x.audioPath === n.audioPath)
        )
          error("Narration already exists");
        if (
          !Number.isInteger(n.durationMs) ||
          n.durationMs < 1 ||
          n.durationMs > 60000
        )
          error("Invalid narration duration", 400);
        s.narrations.push(structuredClone(n));
      }),
    getNarration: (id) =>
      transaction((s) => s.narrations.find((n) => n.id === id) ?? null),
    narrations: (mid) =>
      transaction((s) => s.narrations.filter((n) => n.memoryId === mid)),
    async putAudio(path, bytes) {
      const target = imagePath(path, "audio");
      await mkdir(join(target, ".."), { recursive: true });
      await writeFile(target, bytes, { mode: 0o600, flag: "wx" });
    },
    async readAudio(path) {
      return new Uint8Array(await readFile(imagePath(path, "audio")));
    },
    async removeAudio(path) {
      await unlink(imagePath(path, "audio")).catch((e) => {
        if (e.code !== "ENOENT") throw e;
      });
    },
    async audioUrl(n, cap) {
      return `/api/memories/${encodeURIComponent(n.memoryId)}/narrations/${encodeURIComponent(n.id)}/audio${cap?.share ? `?share=${encodeURIComponent(cap.share)}` : cap?.comparison ? `?comparison=${encodeURIComponent(cap.comparison)}` : ""}`;
    },
    reserveConnectionRequest: (kind, resourceId, id, cap) =>
      transaction((s) => {
        const target =
          kind === "voice" ? narration(s, resourceId) : relation(s, resourceId);
        const old = s.connectionRequests.find((r) => r.id === id);
        if (old) {
          if (old.kind !== kind || old.resourceId !== resourceId)
            error("Request belongs to another resource");
          if (old.status === "complete") return "completed" as const;
          error("Request already used");
        }
        if (
          kind === "comparison" &&
          !(target as PerspectiveLink).contributionPublicationId
        )
          error("Comparison not ready");
        if (kind === "voice" && (target as NarrationRecord).transcript !== null)
          error("Transcript already complete");
        if (
          s.connectionRequests.some(
            (r) =>
              r.kind === kind &&
              r.resourceId === resourceId &&
              r.status === "pending" &&
              Date.parse(r.expiresAt) > Date.now(),
          )
        )
          error("Request already pending");
        if (
          !Number.isInteger(cap) ||
          cap < 1 ||
          s.connectionRequests.filter((r) => r.kind === kind).length >= cap
        )
          error("Connection request cap reached", 429);
        s.connectionRequests.push({
          id,
          kind,
          resourceId,
          status: "pending",
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 300000).toISOString(),
        });
        if (kind === "voice")
          (target as NarrationRecord).transcriptionStatus = "pending";
        else (target as PerspectiveLink).synthesisStatus = "pending";
        return "reserved" as const;
      }),
    completeConnectionRequest: (kind, resourceId, id, result) =>
      transaction((s) => {
        const r = s.connectionRequests.find(
          (r) => r.id === id && r.kind === kind && r.resourceId === resourceId,
        );
        if (
          !r ||
          r.status !== "pending" ||
          Date.parse(r.expiresAt) <= Date.now()
        )
          error("Reservation expired or inactive");
        if (kind === "voice") {
          const n = narration(s, resourceId);
          if (typeof result.transcript !== "string" || n.transcript !== null)
            error("Invalid transcript");
          n.transcript = result.transcript;
          n.transcriptionStatus = "complete";
        } else {
          const l = relation(s, resourceId);
          if (!l.contributionPublicationId || !result.synthesis)
            error("Invalid comparison");
          l.synthesis = structuredClone(result.synthesis);
          l.synthesisStatus = "complete";
        }
        r.status = "complete";
      }),
    failConnectionRequest: (kind, resourceId, id) =>
      transaction((s) => {
        const r = s.connectionRequests.find(
          (r) => r.id === id && r.kind === kind && r.resourceId === resourceId,
        );
        if (r?.status === "pending") {
          r.status = "failed";
          if (kind === "voice")
            narration(s, resourceId).transcriptionStatus = "failed";
          else relation(s, resourceId).synthesisStatus = "failed";
        }
      }),
    createOrGetPerspectiveLink: (l) =>
      transaction((s) => {
        const old = s.links.find(
          (x) => x.originalMemoryId === l.originalMemoryId,
        );
        if (old) return old;
        const p = publication(s, l.originalPublicationId);
        if (p.memoryId !== l.originalMemoryId)
          error("Publication belongs to another memory");
        if (
          !l.eventLabel.trim() ||
          l.eventLabel.length > 120 ||
          l.contributionMemoryId ||
          l.contributionPublicationId
        )
          error("Invalid perspective", 400);
        if (
          s.links.some(
            (x) =>
              x.id === l.id ||
              x.inviteTokenHash === l.inviteTokenHash ||
              x.comparisonTokenHash === l.comparisonTokenHash,
          )
        )
          error("Perspective already exists");
        s.links.push(structuredClone(l));
        return l;
      }),
    getPerspectiveLink: (id) =>
      transaction((s) => s.links.find((l) => l.id === id) ?? null),
    findPerspectiveByInviteHash: (hash) =>
      transaction(
        (s) => s.links.find((l) => l.inviteTokenHash === hash) ?? null,
      ),
    findPerspectiveByComparisonHash: (hash) =>
      transaction(
        (s) => s.links.find((l) => l.comparisonTokenHash === hash) ?? null,
      ),
    findPerspectiveByMemory: (mid) =>
      transaction(
        (s) =>
          s.links.find(
            (l) => l.originalMemoryId === mid || l.contributionMemoryId === mid,
          ) ?? null,
      ),
    claimPerspective: (id, candidate) =>
      transaction((s) => {
        const l = relation(s, id);
        if (l.contributionMemoryId) return l.contributionMemoryId;
        if (
          candidate.id === l.originalMemoryId ||
          s.memories.some((m) => m.id === candidate.id)
        )
          error("Memory already exists");
        s.memories.push(structuredClone(candidate));
        l.contributionMemoryId = candidate.id;
        return candidate.id;
      }),
    attachPerspectivePublication: (id, mid, pid) =>
      transaction((s) => {
        const l = relation(s, id),
          p = publication(s, pid),
          m = memory(s, mid);
        if (l.contributionMemoryId !== mid || p.memoryId !== mid)
          error("Publication belongs to another memory");
        if (l.contributionPublicationId) {
          if (l.contributionPublicationId !== pid)
            error("Comparison is frozen");
          return;
        }
        if (m.currentPublicationId !== pid) error("Publication changed");
        l.contributionPublicationId = pid;
      }),
    addPublishedMessage: (message, guard) =>
      transaction((s) => {
        const m = memory(s, message.memoryId),
          p = publication(s, guard.publicationId);
        if (
          p.memoryId !== m.id ||
          p.versionId !== message.versionId ||
          message.publicationId !== p.id
        )
          error("Invalid message publication");
        if (guard.kind === "current") {
          if (m.currentPublicationId !== p.id) error("Publication changed");
        } else {
          const l = relation(s, guard.linkId);
          if (
            !l.contributionPublicationId ||
            ![l.originalPublicationId, l.contributionPublicationId].includes(
              p.id,
            )
          )
            error("Publication outside comparison");
        }
        if (message.pinId && !p.pins.some((x) => x.id === message.pinId))
          error("Pin not found", 404);
        if (message.parentId) {
          const parent = s.messages.find(
            (x) =>
              x.id === message.parentId &&
              x.memoryId === m.id &&
              x.versionId === p.versionId,
          );
          if (
            !parent ||
            parent.publicationId !== p.id ||
            (parent.pinId ?? null) !== (message.pinId ?? null)
          )
            error("Invalid reply context", 400);
        }
        if (s.messages.some((x) => x.id === message.id))
          error("Message already exists");
        s.messages.push(structuredClone(message));
      }),
    createMemory: (m) =>
      transaction((s) => {
        if (s.memories.some((x) => x.id === m.id))
          error("Memory already exists");
        s.memories.push(structuredClone(m));
      }),
    getMemory: (id) =>
      transaction((s) => s.memories.find((m) => m.id === id) ?? null, true),
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
      transaction((s) => s.versions.filter((v) => v.memoryId === id), true),
    messages: (id) =>
      transaction((s) => s.messages.filter((v) => v.memoryId === id), true),
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
    getRenderRequest: (mid, rid) =>
      transaction(
        (s) =>
          s.requests.find((r) => r.id === rid && r.memoryId === mid) ?? null,
        false,
      ),
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
        if (
          cap !== null &&
          (!Number.isInteger(cap) || cap < 1 || s.requests.length >= cap)
        )
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
