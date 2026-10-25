import { it, expect } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createLocalStore } from "@/lib/server/local-store";
import { MemoryService } from "@/lib/server/memories";
import { OutsideFrameService } from "@/lib/server/outside-frame";
const image = {
  bytes: Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=",
    "base64",
  ),
  mimeType: "image/png",
};
it("requires an authored recollection and owner; replays an exact wider reconstruction without replacing the source", async () => {
  const store = createLocalStore(await mkdtemp(join(tmpdir(), "outside-")));
  let calls = 0;
  const ai = {
    configured: true,
    extractScene: async () => ({
      setting: null,
      people: [],
      details: [],
      perspective: null,
      feelings: [],
      followUpQuestions: [],
    }),
    generateImage: async () => image,
    editImage: async () => {
      calls++;
      return image;
    },
  };
  const memories = new MemoryService(store, ai),
    m = await memories.createMemory({
      title: "",
      authorName: "",
      recipientName: "",
      story: "",
      scenePlan: null,
    }),
    auth = { memoryId: m.id, ownerToken: m.authorToken },
    rid = randomUUID(),
    vid = randomUUID();
  await store.putImage(m.id + "/source.png", image);
  await store.reserveRender(m.id, rid, null);
  await store.completeRender(m.id, rid, {
    id: vid,
    memoryId: m.id,
    parentVersionId: null,
    imagePath: m.id + "/source.png",
    origin: "source",
    scene: {
      confirmed: true,
      authorAdditions: "",
      plan: await ai.extractScene(),
    },
    instruction: null,
    createdAt: new Date().toISOString(),
  });
  const svc = new OutsideFrameService(store, ai),
    requestId = randomUUID();
  const input = {
    requestId,
    sourceVersionId: vid,
    outsideFrameText: "There was a red backpack on the left.",
  };
  await expect(
    svc.expand({ ...auth, ownerToken: "wrong" }, input),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    svc.expand(auth, { ...input, outsideFrameText: "" }),
  ).rejects.toThrow();
  const first = await svc.expand(auth, input),
    replay = await svc.expand(auth, input);
  expect(replay.id).toBe(first.id);
  expect(calls).toBe(1);
  expect(first.scene.outsideFrame?.mode).toBe("wider-reconstruction");
  expect(first.parentVersionId).toBe(vid);
  expect(
    Buffer.from((await store.readImage(m.id + "/source.png")).bytes),
  ).toEqual(Buffer.from(image.bytes));
  await memories.publishMemory(
    m.id,
    m.authorToken,
    first.id,
    "My wider recollection.",
  );
  const pub = await memories.getSharedMemory(
    (
      await memories.publishMemory(
        m.id,
        m.authorToken,
        first.id,
        "My wider recollection.",
      )
    ).shareUrl
      .split("/")
      .at(-1)!,
  );
  expect(pub.sourceImageUrl).toContain(vid);
  expect(pub.imageDescription).toMatch(/reconstruction/i);
  expect(pub.sourceImageUrl).not.toContain("originalPath");
});
