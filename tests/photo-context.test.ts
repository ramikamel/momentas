import { it, expect } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLocalStore } from "@/lib/server/local-store";
import { MemoryService } from "@/lib/server/memories";
import { PhotoContextService } from "@/lib/server/photo-context";
import { randomUUID } from "node:crypto";
const ai = {
  extractScene: async () => ({
    setting: null,
    people: [],
    details: [],
    feelings: [],
    perspective: null,
    followUpQuestions: [],
  }),
  generateImage: async () => ({
    bytes: new Uint8Array(),
    mimeType: "image/png",
  }),
  editImage: async () => ({ bytes: new Uint8Array(), mimeType: "image/png" }),
};
async function setup() {
  const store = createLocalStore(
    await mkdtemp(join(tmpdir(), "photo-context-")),
  );
  const m = await new MemoryService(store, ai).createMemory({
    title: "",
    authorName: "",
    recipientName: "",
    story: "",
    scenePlan: null,
  });
  const vid = randomUUID(),
    rid = randomUUID();
  await store.reserveRender(m.id, rid, null);
  await store.completeRender(m.id, rid, {
    id: vid,
    memoryId: m.id,
    parentVersionId: null,
    imagePath: "unused.png",
    scene: {
      confirmed: true,
      authorAdditions: "",
      plan: await ai.extractScene(),
    },
    origin: "source",
    instruction: null,
    createdAt: new Date().toISOString(),
  });
  return { store, auth: { memoryId: m.id, ownerToken: m.authorToken }, vid };
}
it("keeps context drafts private, rejects revision conflict and atomically projects story", async () => {
  const { store, auth, vid } = await setup();
  const service = new PhotoContextService(store);
  await expect(
    service.list({ ...auth, ownerToken: "wrong" }, vid),
  ).rejects.toMatchObject({ status: 403 });
  const saved = await service.save(auth, vid, {
    key: "story",
    revision: 0,
    text: "My own account.",
    questionIndex: 1,
  });
  expect(saved.revision).toBe(1);
  expect((await store.getMemory(auth.memoryId))?.story).toBe("My own account.");
  await expect(
    service.save(auth, vid, {
      key: "story",
      revision: 0,
      text: "stale",
      questionIndex: 0,
    }),
  ).rejects.toMatchObject({ status: 409 });
  expect(await store.getVersionPins(auth.memoryId, vid)).toEqual([]);
});
it("applies a saved narration once across retries and keeps story and object drafts separate", async () => {
  const { store, auth, vid } = await setup(),
    service = new PhotoContextService(store),
    nid = randomUUID();
  await store.saveNarration({
    id: nid,
    memoryId: auth.memoryId,
    audioPath: auth.memoryId + "/" + nid + ".wav",
    durationMs: 2000,
    transcript: "My recorded words.",
    transcriptionStatus: "complete",
    createdAt: new Date().toISOString(),
  });
  const input = {
    key: "story",
    revision: 0,
    text: "Typed while waiting.",
    questionIndex: 0,
    narrationId: nid,
  };
  const first = await service.save(auth, vid, input),
    replay = await service.save(auth, vid, input);
  expect(first.text).toBe("Typed while waiting.\n\nMy recorded words.");
  expect(replay).toEqual(first);
  const note = await service.save(auth, vid, {
    key: "note:" + randomUUID(),
    revision: 0,
    text: "The helmet was borrowed.",
    questionIndex: 0,
    region: { x: 0.5, y: 0.2 },
  });
  expect(note.text).toBe("The helmet was borrowed.");
  expect((await store.getMemory(auth.memoryId))?.story).toBe(first.text);
});
it("question GET never calls AI and prepare caches questions without writing invented answers", async () => {
  const { store, auth, vid } = await setup();
  let calls = 0;
  const service = new PhotoContextService(store, async () => {
    calls++;
    return [{ id: "a", text: "What happened just before this?" }];
  });
  expect(await service.questions(auth, vid)).toBeNull();
  await Promise.all([
    service.prepareQuestions(auth, vid),
    service.prepareQuestions(auth, vid),
  ]);
  expect(calls).toBe(1);
  expect((await service.questions(auth, vid))?.questions).toHaveLength(1);
  expect((await store.getMemory(auth.memoryId))?.story).toBe("");
});
it("saves later text/progress without an insertion command and preserves recording playback association", async () => {
  const { store, auth, vid } = await setup(),
    service = new PhotoContextService(store),
    nid = randomUUID();
  await store.saveNarration({
    id: nid,
    memoryId: auth.memoryId,
    audioPath: auth.memoryId + "/" + nid + ".wav",
    durationMs: 2000,
    transcript: "Recorded words.",
    transcriptionStatus: "complete",
    createdAt: new Date().toISOString(),
  });
  const inserted = await service.save(auth, vid, {
    key: "story",
    revision: 0,
    text: "Typed.",
    questionIndex: 0,
    narrationId: nid,
  });
  const edited = await service.save(auth, vid, {
    key: "story",
    revision: inserted.revision,
    text: inserted.text + " More typed words.",
    questionIndex: 2,
  });
  expect(edited.text).toBe("Typed.\n\nRecorded words. More typed words.");
  expect(edited.questionIndex).toBe(2);
  expect(edited.narrationId).toBe(nid);
  expect(edited.appliedNarrations).toEqual([nid]);
  expect((await store.getMemory(auth.memoryId))?.story).toBe(edited.text);
  expect((await store.getMemory(auth.memoryId))?.narrationId).toBe(nid);
});
it("persists an unfinished recording on its original context across reopening and clears it after insertion", async () => {
  const { store, auth, vid } = await setup(),
    nid = randomUUID();
  const service = new PhotoContextService(store);
  await store.saveNarration({
    id: nid,
    memoryId: auth.memoryId,
    audioPath: auth.memoryId + "/" + nid + ".wav",
    durationMs: 2000,
    transcript: null,
    transcriptionStatus: "idle",
    createdAt: new Date().toISOString(),
  });
  const pending = await service.save(auth, vid, {
    key: "story",
    revision: 0,
    text: "Typed beginning.",
    questionIndex: 0,
    recordingId: nid,
  });
  expect(pending.pendingNarrationId).toBe(nid);
  expect(
    (await new PhotoContextService(store).list(auth, vid))[0]
      .pendingNarrationId,
  ).toBe(nid);
  const edited = await service.save(auth, vid, {
    key: "story",
    revision: pending.revision,
    text: "Edited while recording.",
    questionIndex: 0,
  });
  expect(edited.pendingNarrationId).toBe(nid);
  await store.updateMemory(auth.memoryId, { story: "Edited while recording." });
  const requestId = randomUUID();
  await store.reserveConnectionRequest("voice", nid, requestId, 100);
  await store.completeConnectionRequest("voice", nid, requestId, {
    transcript: "Recovered recording.",
  });
  const applied = await service.save(auth, vid, {
    key: "story",
    revision: edited.revision,
    text: edited.text,
    questionIndex: 0,
    narrationId: nid,
  });
  expect(applied.pendingNarrationId).toBeUndefined();
  expect(applied.text).toBe("Edited while recording.\n\nRecovered recording.");
});
