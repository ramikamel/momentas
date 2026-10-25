import { test, expect, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLocalStore } from "../src/lib/server/local-store";
const folders: string[] = [];
afterEach(async () => {
  await Promise.all(
    folders.splice(0).map((p) => rm(p, { recursive: true, force: true })),
  );
});
const scene = {
  confirmed: true as const,
  authorAdditions: "",
  plan: {
    setting: { text: "Park", sourceQuote: "the green park" },
    people: [],
    details: [],
    perspective: null,
    feelings: [],
    followUpQuestions: [],
  },
};
async function fixture() {
  const store = createLocalStore(await mkdtemp(join(tmpdir(), "connections-")));
  await store.createMemory({
    id: "m",
    title: "Title",
    authorName: "A",
    recipientName: "B",
    story: "Story",
    scenePlan: null,
    authorTokenHash: "hash",
    shareTokenHash: null,
    publishedVersionId: null,
    publishedCaption: "",
    publishedTitle: "",
    publishedAuthorName: "",
    publishedRecipientName: "",
    createdAt: new Date().toISOString(),
  });
  await store.reserveRender("m", "r", 24);
  await store.completeRender("m", "r", {
    id: "v",
    memoryId: "m",
    parentVersionId: null,
    imagePath: "m/v.png",
    scene,
    instruction: null,
    createdAt: new Date().toISOString(),
  });
  return store;
}
test("snapshots freeze pins and reject a same-image stale message", async () => {
  const s = await fixture();
  await s.saveVersionPins("m", "v", [
    {
      id: "pin",
      x: 0,
      y: 1,
      label: "Park",
      detailPath: "setting",
      sourceQuote: "green park",
    },
  ]);
  const a = await s.publishSnapshot("m", {
    versionId: "v",
    caption: "first",
    includeNarration: false,
    shareTokenHash: "share",
  });
  await s.saveVersionPins("m", "v", []);
  const b = await s.publishSnapshot("m", {
    versionId: "v",
    caption: "second",
    includeNarration: false,
    shareTokenHash: "share",
  });
  expect(a.id).not.toBe(b.id);
  expect((await s.getPublication(a.id))?.pins).toHaveLength(1);
  await expect(
    s.addPublishedMessage(
      {
        id: "msg",
        memoryId: "m",
        versionId: "v",
        role: "recipient",
        displayName: "B",
        text: "?",
        parentId: null,
        createdAt: new Date().toISOString(),
        publicationId: a.id,
      },
      { kind: "current", publicationId: a.id },
    ),
  ).rejects.toMatchObject({ status: 409 });
});
test("pins require version ownership, coordinates and exact sourced excerpts", async () => {
  const s = await fixture();
  const pin = {
    id: "p",
    x: NaN,
    y: 0,
    label: "Park",
    detailPath: "setting",
    sourceQuote: "green park",
  };
  await expect(s.saveVersionPins("m", "v", [pin])).rejects.toMatchObject({
    status: 400,
  });
  await expect(
    s.saveVersionPins("m", "v", [{ ...pin, x: 0, sourceQuote: "invented" }]),
  ).rejects.toMatchObject({ status: 400 });
  await expect(s.saveVersionPins("m", "missing", [])).rejects.toMatchObject({
    status: 404,
  });
});
test("voice reservations serialize, consume quota after failure and complete atomically", async () => {
  const s = await fixture();
  await s.saveNarration({
    id: "n",
    memoryId: "m",
    audioPath: "m/n.wav",
    durationMs: 1000,
    transcript: null,
    transcriptionStatus: "idle",
    createdAt: new Date().toISOString(),
  });
  expect(await s.reserveConnectionRequest("voice", "n", "q", 2)).toBe(
    "reserved",
  );
  expect((await s.getNarration("n"))?.transcriptionStatus).toBe("pending");
  await expect(
    s.reserveConnectionRequest("voice", "n", "q2", 2),
  ).rejects.toMatchObject({ status: 409 });
  await s.failConnectionRequest("voice", "n", "q");
  expect((await s.getNarration("n"))?.transcriptionStatus).toBe("failed");
  await s.reserveConnectionRequest("voice", "n", "q2", 2);
  await s.completeConnectionRequest("voice", "n", "q2", {
    transcript: "hello",
  });
  expect(await s.reserveConnectionRequest("voice", "n", "q2", 2)).toBe(
    "completed",
  );
  expect((await s.getNarration("n"))?.transcript).toBe("hello");
  await expect(
    s.reserveConnectionRequest("voice", "n", "q3", 2),
  ).rejects.toBeTruthy();
});
