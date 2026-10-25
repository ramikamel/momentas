import { loadEnvConfig } from "@next/env";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { getStore } from "../src/lib/server/store";
import { MemoryService } from "../src/lib/server/memories";
import { PerspectiveService } from "../src/lib/server/perspectives";
import { PinService } from "../src/lib/server/pins";
import { VoiceService } from "../src/lib/server/voice-service";
import { encodeWav } from "../src/lib/memory/audio";
loadEnvConfig(process.cwd());
async function main() {
  if (!process.env.SUPABASE_URL)
    throw new Error("Configure the server-side Supabase connection.");
  if (process.env.E2E_TEST_MODE)
    throw new Error("Live storage check must not use test mode.");
  const store = getStore();
  const prepared = JSON.parse(
    await readFile(process.argv[2] || "tmp/meta-smoke/scene.json", "utf8"),
  );
  const image = {
    bytes: new Uint8Array(
      await readFile(process.argv[3] || "public/sample-memory.webp"),
    ),
    mimeType: "image/webp",
  };
  // Prepared real Muse artwork, not a new model response. This check makes no image calls.
  const memory = new MemoryService(store, {
    configured: true,
    extractScene: async () => prepared.plan,
    generateImage: async () => image,
    editImage: async () => image,
  });
  const draft = {
    title: "A fictional bicycle afternoon",
    authorName: "Alex (sample)",
    recipientName: "Dad (sample)",
    story: "A fictional sample for connection testing.",
    scenePlan: null,
  };
  const a = await memory.createMemory(draft),
    auth = { memoryId: a.id, ownerToken: a.authorToken };
  const v = await memory.renderVersion(a.id, a.authorToken, {
    requestId: randomUUID(),
    scene: prepared,
    baseVersionId: null,
    instruction: null,
  });
  const setting = prepared.plan.setting;
  if (setting)
    await new PinService(store).save(auth, v.id, [
      {
        id: randomUUID(),
        x: 0.42,
        y: 0.5,
        detailPath: "setting",
        label: setting.text,
        sourceQuote: setting.sourceQuote.slice(0, 500),
      },
    ]);
  // Canonical silence checks private storage only; it is never called narration or sent to ASR.
  const voice = new VoiceService(store),
    n = await voice.upload(auth, encodeWav(new Float32Array(24000)));
  const before = await memory.getAuthorMemory(a.id, a.authorToken);
  await memory.saveDraft(a.id, a.authorToken, { ...before, narrationId: n.id });
  const shared = await memory.publishMemory(
    a.id,
    a.authorToken,
    v.id,
    "I remember the red bicycle and how enormous the parking lot felt.",
  );
  const st = shared.shareUrl.split("/").at(-1)!;
  if ((await memory.getSharedMemory(st)).narration)
    throw new Error("Audio was shared without consent.");
  const ps = new PerspectiveService(store),
    invite = (await ps.createInvite(auth, "Our bicycle afternoon"))!,
    it = invite.inviteUrl!.split("/").at(-1)!;
  const b = await ps.claim(it, "Dad (sample)"),
    ca = { memoryId: b.memoryId, ownerToken: b.contributorToken };
  const childView = await memory.getAuthorMemory(
    b.memoryId,
    b.contributorToken,
  );
  await memory.saveDraft(b.memoryId, b.contributorToken, {
    ...childView,
    story: "A fictional second account of the bicycle afternoon.",
  });
  const cv = await memory.renderVersion(b.memoryId, b.contributorToken, {
    requestId: randomUUID(),
    scene: prepared,
    baseVersionId: null,
    instruction: null,
  });
  await memory.publishMemory(
    b.memoryId,
    b.contributorToken,
    cv.id,
    "I remember letting go of the red bicycle and watching you ride on your own.",
  );
  const child = await memory.getAuthorMemory(b.memoryId, b.contributorToken);
  await ps.attachContribution(ca, invite.id, child.currentPublicationId!);
  await ps.synthesize(ca, invite.id, randomUUID());
  const ct = invite.comparisonUrl.split("/").at(-1)!,
    view = await ps.getComparison(ct);
  const message = await ps.postComparisonMessage(ct, {
    side: "left",
    publicationId: view.left.id,
    pinId: view.left.pins[0]?.id ?? null,
    displayName: "Dad (sample)",
    text: "What made the parking lot feel so enormous?",
  });
  await memory.postStorytellerReply(
    a.id,
    a.authorToken,
    message.id,
    "Sample reply: I was seeing it from so close to the ground.",
  );
  await mkdir(".data", { recursive: true });
  await writeFile(
    ".data/connections-demo.json",
    JSON.stringify({
      fictional: true,
      preparedImageReusedForStorageCheck: true,
      author: a,
      contributor: b,
      comparisonUrl: invite.comparisonUrl,
      inviteUrl: invite.inviteUrl,
      shareUrl: shared.shareUrl,
    }),
    { mode: 0o600 },
  );
  console.log(
    JSON.stringify({
      storage: "supabase",
      publications: true,
      privateAudio: true,
      pins: true,
      invitationClaim: true,
      comparisonSynthesis: true,
      humanExchange: true,
      newImageCalls: 0,
      preparedImageReused: true,
    }),
  );
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : "Connection check failed");
  process.exitCode = 1;
});
