import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createLocalStore } from "@/lib/server/local-store";
import { MemoryService } from "@/lib/server/memories";
import { PerspectiveService } from "@/lib/server/perspectives";
import { PinService } from "@/lib/server/pins";
import { VoiceService } from "@/lib/server/voice-service";
import { encodeWav } from "@/lib/memory/audio";
const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })),
  );
});
const plan = {
  setting: {
    text: "The parking lot",
    sourceQuote: "The parking lot felt enormous.",
  },
  people: [],
  details: [],
  perspective: null,
  feelings: [],
  followUpQuestions: [],
};
const scene = { confirmed: true as const, authorAdditions: "", plan };
const png = {
  bytes: Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=",
    "base64",
  ),
  mimeType: "image/png",
};
async function fixture() {
  const d = await mkdtemp(join(tmpdir(), "momentas-flow-"));
  dirs.push(d);
  const store = createLocalStore(d);
  const memory = new MemoryService(store, {
    extractScene: async () => plan,
    generateImage: async () => png,
    editImage: async () => png,
  });
  const created = await memory.createMemory({
    title: "Our ride",
    authorName: "Alex",
    recipientName: "Dad",
    story: "The parking lot felt enormous. SECRET DRAFT",
    scenePlan: null,
  });
  const auth = { memoryId: created.id, ownerToken: created.authorToken };
  const v = await memory.renderVersion(created.id, created.authorToken, {
    requestId: randomUUID(),
    scene,
    baseVersionId: null,
    instruction: null,
  });
  await memory.publishMemory(
    created.id,
    created.authorToken,
    v.id,
    "The parking lot felt enormous.",
  );
  const compare = vi.fn(async () => ({
    shared: [],
    distinct: [],
    questions: ["What do you remember?"],
  }));
  const perspectives = new PerspectiveService(store, compare);
  return { store, memory, auth, v, compare, perspectives };
}
it("keeps invitations neutral, claims exactly once under concurrency and separates editing access", async () => {
  const f = await fixture();
  const invitation = (await f.perspectives.createInvite(
    f.auth,
    "The bicycle afternoon",
  ))!;
  const token = invitation.inviteUrl!.split("/").at(-1)!;
  expect(await f.perspectives.getInvite(token)).toEqual({
    eventLabel: "The bicycle afternoon",
    inviterName: "Alex",
    contributionExists: false,
  });
  const [a, b] = await Promise.all([
    f.perspectives.claim(token, "Dad"),
    f.perspectives.claim(token, "Another name"),
  ]);
  expect(a.memoryId).toBe(b.memoryId);
  expect(a.contributorToken).toBe(b.contributorToken);
  await expect(
    f.memory.getAuthorMemory(f.auth.memoryId, a.contributorToken),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    f.perspectives.getComparison(invitation.comparisonUrl.split("/").at(-1)!),
  ).rejects.toMatchObject({ status: 409 });
  expect(
    (await f.memory.getAuthorMemory(a.memoryId, a.contributorToken)).story,
  ).toBe("");
});
it("freezes two published accounts, caches only public synthesis, and keeps pin questions/replies on the correct account", async () => {
  const f = await fixture();
  const pin = {
    id: randomUUID(),
    x: 0.5,
    y: 0.5,
    label: "FORGED",
    detailPath: "setting",
    sourceQuote: "felt enormous",
  };
  await new PinService(f.store).save(f.auth, f.v.id, [pin]);
  await f.memory.publishMemory(
    f.auth.memoryId,
    f.auth.ownerToken,
    f.v.id,
    "The parking lot felt enormous.",
  );
  const invite = (await f.perspectives.createInvite(f.auth, "Our ride"))!,
    token = invite.inviteUrl!.split("/").at(-1)!,
    child = await f.perspectives.claim(token, "Dad");
  const v = await f.memory.renderVersion(
    child.memoryId,
    child.contributorToken,
    { requestId: randomUUID(), scene, baseVersionId: null, instruction: null },
  );
  await f.memory.publishMemory(
    child.memoryId,
    child.contributorToken,
    v.id,
    "I let go when you found your balance.",
  );
  const childMemory = await f.memory.getAuthorMemory(
    child.memoryId,
    child.contributorToken,
  );
  const childAuth = {
    memoryId: child.memoryId,
    ownerToken: child.contributorToken,
  };
  await f.perspectives.attachContribution(
    childAuth,
    invite.id,
    childMemory.currentPublicationId!,
  );
  await f.perspectives.synthesize(childAuth, invite.id, randomUUID());
  await f.perspectives.synthesize(f.auth, invite.id, randomUUID());
  expect(f.compare).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(f.compare.mock.calls)).not.toContain("SECRET DRAFT");
  const ct = invite.comparisonUrl.split("/").at(-1)!,
    view = await f.perspectives.getComparison(ct);
  expect(view.left.pins[0].label).toBe("The parking lot");
  await expect(
    f.perspectives.postComparisonMessage(ct, {
      side: "right",
      publicationId: view.right.id,
      pinId: pin.id,
      displayName: "Alex",
      text: "Why?",
    }),
  ).rejects.toMatchObject({ status: 400 });
  const q = await f.perspectives.postComparisonMessage(ct, {
    side: "left",
    publicationId: view.left.id,
    pinId: pin.id,
    displayName: "Dad",
    text: "Were you scared?",
  });
  await f.memory.postStorytellerReply(
    f.auth.memoryId,
    f.auth.ownerToken,
    q.id,
    "For a moment.",
  );
  expect(
    (
      await f.memory.getAuthorMemory(f.auth.memoryId, f.auth.ownerToken)
    ).messages.find((m) => m.id === q.id)?.pinContext?.sourceQuote,
  ).toBe("felt enormous");
  await f.memory.publishMemory(
    f.auth.memoryId,
    f.auth.ownerToken,
    f.v.id,
    "Changed caption",
  );
  const frozen = await f.perspectives.getComparison(ct);
  expect(frozen.left.caption).toBe("The parking lot felt enormous.");
  expect(frozen.messages.find((m) => m.parentId === q.id)?.pinId).toBe(pin.id);
});
it("retains uploaded voice after provider failure and shares it only after a deliberate publication choice", async () => {
  const f = await fixture();
  const transcribe = vi
    .fn()
    .mockRejectedValueOnce(new Error("outage"))
    .mockResolvedValue({
      transcript: "The parking lot felt enormous.",
      audioDurationMs: 1000,
    });
  const voice = new VoiceService(f.store, transcribe);
  const n = await voice.upload(f.auth, encodeWav(new Float32Array(24000)));
  await expect(voice.transcribe(f.auth, n.id, randomUUID())).rejects.toThrow(
    "outage",
  );
  expect(
    await f.store.readAudio(`${f.auth.memoryId}/${n.id}.wav`),
  ).toHaveLength(48044);
  await voice.transcribe(f.auth, n.id, randomUUID());
  await voice.transcribe(f.auth, n.id, randomUUID());
  expect(transcribe).toHaveBeenCalledTimes(2);
  const draft = await f.memory.getAuthorMemory(
    f.auth.memoryId,
    f.auth.ownerToken,
  );
  await f.memory.saveDraft(f.auth.memoryId, f.auth.ownerToken, {
    ...draft,
    narrationId: n.id,
  });
  const share = await f.memory.publishMemory(
    f.auth.memoryId,
    f.auth.ownerToken,
    f.v.id,
    "A ride",
  );
  const st = share.shareUrl.split("/").at(-1)!;
  expect((await f.memory.getSharedMemory(st)).narration).toBeNull();
  await expect(
    voice.getAudio(f.auth.memoryId, n.id, "", st),
  ).rejects.toMatchObject({ status: 403 });
  await f.memory.publishMemory(
    f.auth.memoryId,
    f.auth.ownerToken,
    f.v.id,
    "A ride",
    true,
  );
  expect((await f.memory.getSharedMemory(st)).narration?.transcript).toBe(
    "The parking lot felt enormous.",
  );
  expect(await voice.getAudio(f.auth.memoryId, n.id, "", st)).toHaveLength(
    48044,
  );
});
