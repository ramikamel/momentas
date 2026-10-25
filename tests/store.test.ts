import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLocalStore } from "../src/lib/server/local-store";
import type { MemoryRecord, ImageVersion } from "../src/lib/memory/types";
let dir: string;
const memory = (id = "m"): MemoryRecord => ({
  id,
  title: "A",
  authorName: "A",
  recipientName: "B",
  story: "Story",
  scenePlan: null,
  authorTokenHash: "author",
  shareTokenHash: null,
  publishedVersionId: null,
  publishedCaption: "",
  publishedTitle: "",
  publishedAuthorName: "",
  publishedRecipientName: "",
  createdAt: "2026-10-24T00:00:00.000Z",
});
const version = (id = "v", memoryId = "m"): ImageVersion => ({
  id,
  memoryId,
  parentVersionId: null,
  imagePath: `${memoryId}/${id}.png`,
  scene: {
    plan: {
      setting: null,
      people: [],
      details: [],
      perspective: null,
      feelings: [],
      followUpQuestions: [],
    },
    authorAdditions: "",
    confirmed: true,
  },
  instruction: null,
  createdAt: "2026-10-24T00:00:00.000Z",
});
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "memories-"));
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  await rm(dir, { recursive: true, force: true });
});
test("persists memories and image mime across adapters", async () => {
  const s = createLocalStore(dir);
  await s.createMemory(memory());
  await s.putImage("m/v.png", {
    bytes: new Uint8Array([1, 2]),
    mimeType: "image/png",
  });
  const reopened = createLocalStore(dir);
  expect(await reopened.getMemory("m")).toEqual({
    ...memory(),
    narrationId: null,
    currentPublicationId: null,
  });
  expect(await reopened.readImage("m/v.png")).toEqual({
    bytes: new Uint8Array([1, 2]),
    mimeType: "image/png",
  });
});
test("serializes reservations and makes completed requests idempotent", async () => {
  const s = createLocalStore(dir);
  await s.createMemory(memory());
  const results = await Promise.allSettled([
    s.reserveRender("m", "r", 4),
    s.reserveRender("m", "r2", 4),
  ]);
  expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1);
  await s.completeRender("m", "r", version());
  expect(await s.reserveRender("m", "r", 4)).toEqual({
    kind: "completed",
    version: version(),
  });
});
test("counts failures toward the global cap and rejects foreign request IDs", async () => {
  const s = createLocalStore(dir);
  await s.createMemory(memory());
  await s.createMemory(memory("other"));
  await s.reserveRender("m", "r", 1);
  await s.failRender("m", "r");
  await expect(s.reserveRender("other", "next", 1)).rejects.toThrow();
  await expect(s.reserveRender("other", "r", 10)).rejects.toThrow();
});
test("rejects expired completion and conditional messages after republishing", async () => {
  const s = createLocalStore(dir);
  await s.createMemory(memory());
  await s.reserveRender("m", "r", 5);
  vi.spyOn(Date, "now").mockReturnValue(Date.now() + 301000);
  await expect(s.completeRender("m", "r", version())).rejects.toThrow();
  await expect(
    s.addMessage(
      {
        id: "msg",
        memoryId: "m",
        versionId: "v",
        role: "recipient",
        displayName: "B",
        text: "Hello",
        parentId: null,
        createdAt: "2026-10-24T00:00:00.000Z",
      },
      "v",
    ),
  ).rejects.toThrow();
  expect(await s.versions("m")).toEqual([]);
});
test("rejects traversal and foreign version attachments", async () => {
  const s = createLocalStore(dir);
  await s.createMemory(memory());
  await expect(
    s.putImage("../outside", {
      bytes: new Uint8Array(),
      mimeType: "image/png",
    }),
  ).rejects.toThrow();
  await s.reserveRender("m", "r", 5);
  await expect(
    s.completeRender("m", "r", version("v", "other")),
  ).rejects.toThrow();
});
test("reserves distinct memories concurrently without losing durable writes", async () => {
  const a = createLocalStore(dir),
    b = createLocalStore(dir);
  await Promise.all([
    a.createMemory(memory()),
    b.createMemory(memory("other")),
  ]);
  const reservations = await Promise.all([
    a.reserveRender("m", "r", 2),
    b.reserveRender("other", "r2", 2),
  ]);
  expect(reservations).toEqual([{ kind: "reserved" }, { kind: "reserved" }]);
  expect(await createLocalStore(dir).getMemory("other")).not.toBeNull();
});
test("rejects duplicate pending requests without counting a second reservation", async () => {
  const s = createLocalStore(dir);
  await s.createMemory(memory());
  await s.reserveRender("m", "r", 1);
  await expect(s.reserveRender("m", "r", 1)).rejects.toThrow();
  await s.completeRender("m", "r", version());
  await expect(s.reserveRender("m", "r", 1)).resolves.toHaveProperty(
    "kind",
    "completed",
  );
});
test("stored image bytes cannot be replaced by a reused path", async () => {
  const s = createLocalStore(dir);
  await s.putImage("m/v.png", {
    bytes: new Uint8Array([1]),
    mimeType: "image/png",
  });
  await expect(
    s.putImage("m/v.png", {
      bytes: new Uint8Array([2]),
      mimeType: "image/png",
    }),
  ).rejects.toThrow();
  expect((await s.readImage("m/v.png")).bytes).toEqual(new Uint8Array([1]));
});
test("rejects publishing and threaded messages with foreign version references", async () => {
  const s = createLocalStore(dir);
  await s.createMemory(memory());
  await s.createMemory(memory("other"));
  await s.reserveRender("m", "r", 3);
  await s.completeRender("m", "r", version());
  await expect(
    s.updateMemory("other", { publishedVersionId: "v" }),
  ).rejects.toThrow();
  await expect(
    s.addMessage({
      id: "x",
      memoryId: "other",
      versionId: "v",
      role: "recipient",
      displayName: "B",
      text: "Hi",
      parentId: null,
      createdAt: "2026-10-24T00:00:00.000Z",
    }),
  ).rejects.toThrow();
});
test("expired work cannot complete or fail a newer render", async () => {
  const s = createLocalStore(dir);
  await s.createMemory(memory());
  await s.reserveRender("m", "old", 3);
  vi.spyOn(Date, "now").mockReturnValue(Date.now() + 301000);
  await s.reserveRender("m", "new", 3);
  await s.failRender("m", "old");
  await expect(
    s.completeRender("m", "old", version("old-version")),
  ).rejects.toThrow();
  await s.completeRender("m", "new", version("new-version"));
  expect((await s.versions("m")).map((v) => v.id)).toEqual(["new-version"]);
});
test("accepts a message only while its viewed version remains published", async () => {
  const s = createLocalStore(dir);
  await s.createMemory(memory());
  await s.reserveRender("m", "r", 3);
  await s.completeRender("m", "r", version());
  await s.updateMemory("m", { publishedVersionId: "v" });
  await s.addMessage(
    {
      id: "x",
      memoryId: "m",
      versionId: "v",
      role: "recipient",
      displayName: "B",
      text: "Hi",
      parentId: null,
      createdAt: "2026-10-24T00:00:00.000Z",
    },
    "v",
  );
  expect(await s.messages("m")).toHaveLength(1);
  await s.updateMemory("m", { publishedVersionId: null });
  await expect(
    s.addMessage(
      {
        id: "y",
        memoryId: "m",
        versionId: "v",
        role: "recipient",
        displayName: "B",
        text: "Hi",
        parentId: null,
        createdAt: "2026-10-24T00:00:00.000Z",
      },
      "v",
    ),
  ).rejects.toThrow();
  expect(await s.messages("m")).toHaveLength(1);
});
test("expired pending object maps expose failed status on read and allow retry", async () => {
  const s = createLocalStore(dir);
  await s.createMemory(memory());
  await s.reserveRender("m", "render", 4);
  await s.completeRender("m", "render", version());
  await s.claimObjectMap("m", "v", "job", false);
  const now = Date.now();
  vi.spyOn(Date, "now").mockReturnValue(now + 181000);
  expect(await s.getObjectMap("m", "v")).toMatchObject({ status: "failed" });
  expect(await s.claimObjectMap("m", "v", "retry", true)).toMatchObject({
    claimed: true,
    map: { status: "pending" },
  });
});

test("explicit refresh replaces a completed object map but cannot steal a pending scan", async () => {
  const s = createLocalStore(dir);
  await s.createMemory(memory());
  await s.reserveRender("m", "render", 4);
  await s.completeRender("m", "render", version());
  await s.claimObjectMap("m", "v", "job", false);
  await s.saveObjectMap("m", "v", "job", [], "complete");
  expect(await s.claimObjectMap("m", "v", "cached", false)).toMatchObject({
    claimed: false,
  });
  expect(await s.claimObjectMap("m", "v", "refresh", true)).toMatchObject({
    claimed: true,
  });
  expect(
    await s.claimObjectMap("m", "v", "racing-refresh", true),
  ).toMatchObject({ claimed: false, map: { status: "pending" } });
});
