import type {
  ConnectionStore,
  PublicationSnapshot,
  NarrationRecord,
  PerspectiveLink,
  PinDraft,
} from "@/lib/memory/connections";
export function createConnectionSupabaseStore(
  url: string,
  key: string,
): ConnectionStore {
  const base = url.replace(/\/$/, "").replace(/\/rest\/v1$/, "");
  async function req(path: string, init: RequestInit = {}) {
    const r = await fetch(base + path, {
      ...init,
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        ...init.headers,
      },
      cache: "no-store",
    });
    if (!r.ok) {
      const detail = await r.text();
      throw Object.assign(new Error("Connection storage request failed"), {
        status: /cap reached/i.test(detail)
          ? 429
          : /not found/i.test(detail)
            ? 404
            : /invalid|quote|pin position|too many/i.test(detail)
              ? 400
              : r.status === 400
                ? 409
                : r.status,
      });
    }
    if (r.status === 204) return null;
    const t = await r.text();
    return t ? JSON.parse(t) : null;
  }
  const action = (name: string, data: object) =>
    req("/rest/v1/rpc/connection_action", {
      method: "POST",
      body: JSON.stringify({ p_action: name, p_data: data }),
    });
  async function one<T>(
    table: string,
    field: string,
    value: string,
  ): Promise<T | null> {
    const rows = await req(
      `/rest/v1/${table}?${field}=eq.${encodeURIComponent(value)}&limit=1`,
    );
    return rows[0]?.data ?? null;
  }
  const path = (p: string) => {
    if (!/^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+\.wav$/.test(p))
      throw Object.assign(new Error("Invalid audio path"), { status: 400 });
    return p.split("/").map(encodeURIComponent).join("/");
  };
  return {
    publishSnapshot: (memoryId, input) =>
      action("publish", { memoryId, ...input }),
    getPublication: (id) =>
      one<PublicationSnapshot>("memory_publications", "id", id),
    getVersionPins: async (memoryId, versionId) => {
      const rows = await req(
        `/rest/v1/memory_version_pins?memory_id=eq.${encodeURIComponent(memoryId)}&version_id=eq.${encodeURIComponent(versionId)}`,
      );
      return (rows[0]?.pins ?? []) as PinDraft[];
    },
    saveVersionPins: async (memoryId, versionId, pins) => {
      await action("pins", { memoryId, versionId, pins });
    },
    saveNarration: async (narration) => {
      await action("narration", { narration });
    },
    getNarration: (id) => one<NarrationRecord>("memory_narrations", "id", id),
    narrations: async (memoryId) =>
      (
        await req(
          `/rest/v1/memory_narrations?memory_id=eq.${encodeURIComponent(memoryId)}&order=created_at.asc`,
        )
      ).map((r: { data: NarrationRecord }) => r.data),
    putAudio: async (p, bytes) => {
      await req("/storage/v1/object/memory-audio/" + path(p), {
        method: "POST",
        headers: { "Content-Type": "audio/wav", "x-upsert": "false" },
        body: new Uint8Array(bytes),
      });
    },
    readAudio: async (p) => {
      const r = await fetch(
        base + "/storage/v1/object/authenticated/memory-audio/" + path(p),
        {
          headers: { apikey: key, Authorization: `Bearer ${key}` },
          cache: "no-store",
        },
      );
      if (!r.ok)
        throw Object.assign(new Error("Recording not found"), { status: 404 });
      return new Uint8Array(await r.arrayBuffer());
    },
    removeAudio: async (p) => {
      await req("/storage/v1/object/memory-audio", {
        method: "DELETE",
        body: JSON.stringify({ prefixes: [path(p)] }),
      });
    },
    audioUrl: async (n) => {
      const result = await req(
        "/storage/v1/object/sign/memory-audio/" + path(n.audioPath),
        { method: "POST", body: JSON.stringify({ expiresIn: 900 }) },
      );
      const signed = result.signedURL ?? result.signedUrl;
      if (typeof signed !== "string")
        throw new Error("Could not sign recording");
      return signed.startsWith("http") ? signed : base + "/storage/v1" + signed;
    },
    reserveConnectionRequest: (kind, resourceId, requestId, cap) =>
      action("reserve", { kind, resourceId, requestId, cap }),
    completeConnectionRequest: async (kind, resourceId, requestId, result) => {
      await action("complete", { kind, resourceId, requestId, result });
    },
    failConnectionRequest: async (kind, resourceId, requestId) => {
      await action("fail", { kind, resourceId, requestId });
    },
    createOrGetPerspectiveLink: (link) => action("link", { link }),
    getPerspectiveLink: (id) =>
      one<PerspectiveLink>("perspective_links", "id", id),
    findPerspectiveByInviteHash: (hash) =>
      one<PerspectiveLink>("perspective_links", "data->>inviteTokenHash", hash),
    findPerspectiveByComparisonHash: (hash) =>
      one<PerspectiveLink>(
        "perspective_links",
        "data->>comparisonTokenHash",
        hash,
      ),
    findPerspectiveByMemory: async (memoryId) => {
      const rows = await req(
        `/rest/v1/perspective_links?or=(original_memory_id.eq.${encodeURIComponent(memoryId)},contribution_memory_id.eq.${encodeURIComponent(memoryId)})&limit=1`,
      );
      return rows[0]?.data ?? null;
    },
    claimPerspective: (linkId, candidateMemory) =>
      action("claim", { linkId, candidateMemory }),
    attachPerspectivePublication: async (linkId, memoryId, publicationId) => {
      await action("attach", { linkId, memoryId, publicationId });
    },
    addPublishedMessage: async (message, guard) => {
      await action("message", { message, guard });
    },
  };
}
