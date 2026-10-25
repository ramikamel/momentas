import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createLocalStore } from "@/lib/server/local-store";
import { MemoryService } from "@/lib/server/memories";
import type { ApprovedScene, GeneratedImage } from "@/lib/memory/types";

const folders: string[] = [];
afterEach(async () => {
  await Promise.all(
    folders.splice(0).map((p) => rm(p, { recursive: true, force: true })),
  );
});
const draft = {
  title: "The day Dad let go",
  authorName: "Sam",
  recipientName: "Dad",
  story: "Dad taught me to ride my bike in a big parking lot.",
  scenePlan: null,
};
const plan = {
  setting: { text: "A big parking lot", sourceQuote: "a big parking lot" },
  people: [],
  details: [],
  perspective: null,
  feelings: [],
  followUpQuestions: [],
};
const scene: ApprovedScene = {
  plan,
  authorAdditions: "The bike was red.",
  confirmed: true,
};
const image: GeneratedImage = {
  bytes: Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=",
    "base64",
  ),
  mimeType: "image/png",
};
async function setup() {
  const dir = await mkdtemp(join(tmpdir(), "tme-service-"));
  folders.push(dir);
  const store = createLocalStore(dir);
  const ai = {
    extractScene: vi.fn(async () => plan),
    generateImage: vi.fn(async () => image),
    editImage: vi.fn(async () => image),
  };
  const service = new MemoryService(store, ai);
  const { id, authorToken } = await service.createMemory(draft);
  return { service, ai, store, id, authorToken };
}
describe("complete memory lifecycle", () => {
  it("denies unauthenticated/recipient draft reads and author actions", async () => {
    const { service, id, authorToken } = await setup();
    await expect(service.getAuthorMemory(id, "")).rejects.toMatchObject({
      status: 403,
    });
    const version = await service.renderVersion(id, authorToken, {
      requestId: randomUUID(),
      scene,
      baseVersionId: null,
      instruction: null,
    });
    const { shareUrl } = await service.publishMemory(
      id,
      authorToken,
      version.id,
      "My first ride.",
    );
    const token = shareUrl.split("/").at(-1)!;
    await expect(service.getAuthorMemory(id, token)).rejects.toMatchObject({
      status: 403,
    });
    await expect(service.saveDraft(id, token, draft)).rejects.toMatchObject({
      status: 403,
    });
    await expect(
      service.renderVersion(id, token, {
        requestId: randomUUID(),
        scene,
        baseVersionId: null,
        instruction: null,
      }),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("publishes only an approved snapshot, keeps drafts private, and handles a real question and reply", async () => {
    const { service, id, authorToken } = await setup();
    const v = await service.renderVersion(id, authorToken, {
      requestId: randomUUID(),
      scene,
      baseVersionId: null,
      instruction: null,
    });
    const { shareUrl } = await service.publishMemory(
      id,
      authorToken,
      v.id,
      "How I remember it.",
    );
    const token = shareUrl.split("/").at(-1)!;
    await service.saveDraft(id, authorToken, {
      ...draft,
      title: "Private change",
      authorName: "Private name",
      story: "PRIVATE DRAFT TEXT",
    });
    const shared = await service.getSharedMemory(token);
    expect(shared.title).toBe(draft.title);
    expect(shared.authorName).toBe("Sam");
    expect(JSON.stringify(shared)).not.toContain("PRIVATE");
    expect(shared).not.toHaveProperty("authorTokenHash");
    expect(shared).not.toHaveProperty("scenePlan");
    const q = await service.postRecipientMessage(token, {
      versionId: v.id,
      displayName: "Dad",
      text: "What did you feel?",
    });
    expect(q.role).toBe("recipient");
    await expect(
      service.postStorytellerReply(id, token, q.id, "A forged reply"),
    ).rejects.toMatchObject({ status: 403 });
    const reply = await service.postStorytellerReply(
      id,
      authorToken,
      q.id,
      "I felt proud.",
    );
    expect(reply.role).toBe("storyteller");
    expect(reply.displayName).toBe("Sam");
    expect((await service.getSharedMemory(token)).messages).toHaveLength(2);
    expect((await service.getAuthorMemory(id, authorToken)).shareUrl).toBe(
      shareUrl,
    );
  });
  it("preserves the previous image and the draft after an edit fails and allows a deliberate retry", async () => {
    const { service, ai, id, authorToken } = await setup();
    const v = await service.renderVersion(id, authorToken, {
      requestId: randomUUID(),
      scene,
      baseVersionId: null,
      instruction: null,
    });
    ai.editImage.mockRejectedValueOnce(new Error("provider timed out"));
    await expect(
      service.renderVersion(id, authorToken, {
        requestId: randomUUID(),
        scene,
        baseVersionId: v.id,
        instruction: "Put Dad farther behind me.",
      }),
    ).rejects.toThrow();
    let author = await service.getAuthorMemory(id, authorToken);
    expect(author.versions.map((x) => x.id)).toEqual([v.id]);
    expect(author.story).toBe(draft.story);
    const v2 = await service.renderVersion(id, authorToken, {
      requestId: randomUUID(),
      scene,
      baseVersionId: v.id,
      instruction: "Put Dad farther behind me.",
    });
    expect(v2.parentVersionId).toBe(v.id);
    author = await service.getAuthorMemory(id, authorToken);
    expect(author.versions).toHaveLength(2);
  });
  it("reuses a completed render request without another paid provider attempt", async () => {
    const { service, ai, id, authorToken } = await setup();
    const input = {
      requestId: randomUUID(),
      scene,
      baseVersionId: null,
      instruction: null,
    };
    const first = await service.renderVersion(id, authorToken, input);
    const repeat = await service.renderVersion(id, authorToken, input);
    expect(repeat.id).toBe(first.id);
    expect(ai.generateImage).toHaveBeenCalledTimes(1);
  });
  it("rejects stale recipient messages after republishing and denies draft-image access through a share token", async () => {
    const { service, id, authorToken } = await setup();
    const v1 = await service.renderVersion(id, authorToken, {
      requestId: randomUUID(),
      scene,
      baseVersionId: null,
      instruction: null,
    });
    const { shareUrl } = await service.publishMemory(
      id,
      authorToken,
      v1.id,
      "First",
    );
    const token = shareUrl.split("/").at(-1)!;
    const v2 = await service.renderVersion(id, authorToken, {
      requestId: randomUUID(),
      scene,
      baseVersionId: v1.id,
      instruction: "Bigger lot",
    });
    await expect(service.getImage(id, v2.id, "", token)).rejects.toMatchObject({
      status: 403,
    });
    await service.publishMemory(id, authorToken, v2.id, "Second");
    await expect(
      service.postRecipientMessage(token, {
        versionId: v1.id,
        displayName: "Dad",
        text: "Question about old picture",
      }),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("keeps a saved story and previous scene plan after extraction failure", async () => {
    const { service, ai, id, authorToken } = await setup();
    await service.saveDraft(id, authorToken, { ...draft, scenePlan: plan });
    ai.extractScene.mockRejectedValueOnce(new Error("upstream failed"));
    await expect(
      service.extractScene(id, authorToken, draft.story),
    ).rejects.toThrow();
    expect((await service.getAuthorMemory(id, authorToken)).scenePlan).toEqual(
      plan,
    );
  });
});
