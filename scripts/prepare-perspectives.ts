import { loadEnvConfig } from "@next/env";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { getStore } from "../src/lib/server/store";
import { getAiProvider } from "../src/lib/server/meta";
import { MemoryService } from "../src/lib/server/memories";
import { PerspectiveService } from "../src/lib/server/perspectives";
import { PinService } from "../src/lib/server/pins";
import type { ApprovedScene } from "../src/lib/memory/types";
loadEnvConfig(process.cwd());
(async () => {
  const out = ".data/perspective-showcase.json";
  try {
    await readFile(out);
    throw new Error(
      "A prepared showcase already exists; reuse it instead of generating again.",
    );
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
  const store = getStore(),
    ai = getAiProvider(),
    real = new MemoryService(store, ai);
  const alexScene = JSON.parse(
    await readFile("tmp/meta-smoke/scene.json", "utf8"),
  ) as ApprovedScene;
  const prepared = {
    bytes: new Uint8Array(await readFile("public/sample-memory.webp")),
    mimeType: "image/webp",
  };
  const alexService = new MemoryService(store, {
    ...ai,
    generateImage: async () => prepared,
  });
  const a = await real.createMemory({
    title: "The day you let go",
    authorName: "Alex (fictional sample)",
    recipientName: "Dad",
    story:
      "This is a fictional sample. I remember learning to ride my red bicycle in an enormous parking lot. I felt scared for a moment, then proud.",
    scenePlan: alexScene.plan,
  });
  const auth = { memoryId: a.id, ownerToken: a.authorToken };
  await mkdir(".data", { recursive: true });
  await writeFile(
    out,
    JSON.stringify({ stage: "started", author: a, fictional: true }),
    { mode: 0o600 },
  );
  const av = await alexService.renderVersion(a.id, a.authorToken, {
    requestId: randomUUID(),
    scene: alexScene,
    baseVersionId: null,
    instruction: null,
  });
  const setting = alexScene.plan.perspective ? "perspective" : "setting";
  const detail = alexScene.plan[setting]!;
  await new PinService(store).save(auth, av.id, [
    {
      id: randomUUID(),
      x: 0.22,
      y: 0.48,
      detailPath: setting,
      label: detail.text,
      sourceQuote: detail.sourceQuote.slice(0, 500),
    },
  ]);
  await real.publishMemory(
    a.id,
    a.authorToken,
    av.id,
    "I remember the parking lot feeling enormous. When I looked back, you had let go. I was scared for a moment, then proud that I could ride alone.",
  );
  const ps = new PerspectiveService(store),
    invite = (await ps.createInvite(
      auth,
      "The afternoon we learned to ride a bicycle",
    ))!,
    token = invite.inviteUrl!.split("/").at(-1)!,
    b = await ps.claim(token, "Dad (fictional sample)");
  const story =
    "This is a fictional sample memory from the father’s perspective. I had just let go of the seat of my seven-year-old child’s red bicycle in an empty parking lot on a warm afternoon. I was standing behind my child, watching them pedal away from me. From my eye-level viewpoint, I saw the back of my child on the red bicycle ahead of me. I raised both my hands to cheer. I felt nervous too, then proud when I saw my child riding without my help.";
  const cm = await real.getAuthorMemory(b.memoryId, b.contributorToken);
  await real.saveDraft(b.memoryId, b.contributorToken, { ...cm, story });
  const plan = await real.extractScene(b.memoryId, b.contributorToken, story);
  const scene: ApprovedScene = {
    confirmed: true,
    plan,
    authorAdditions:
      "Use the father’s eye-level viewpoint behind the child, looking at the child riding away on a red bicycle. The father is the camera viewpoint and his face is not in frame.",
  };
  await writeFile(
    out,
    JSON.stringify({
      stage: "before-dad-image",
      author: a,
      contributor: b,
      comparisonUrl: invite.comparisonUrl,
      fictional: true,
    }),
    { mode: 0o600 },
  );
  const began = Date.now(),
    bv = await real.renderVersion(b.memoryId, b.contributorToken, {
      requestId: randomUUID(),
      scene,
      baseVersionId: null,
      instruction: null,
    });
  console.log(
    JSON.stringify({
      stage: "new-dad-perspective",
      seconds: (Date.now() - began) / 1000,
      newImageCalls: 1,
    }),
  );
  if (plan.feelings[0])
    await new PinService(store).save(
      { memoryId: b.memoryId, ownerToken: b.contributorToken },
      bv.id,
      [
        {
          id: randomUUID(),
          x: 0.55,
          y: 0.56,
          detailPath: "feelings.0",
          label: plan.feelings[0].text,
          sourceQuote: plan.feelings[0].sourceQuote.slice(0, 500),
        },
      ],
    );
  await real.publishMemory(
    b.memoryId,
    b.contributorToken,
    bv.id,
    "I remember letting go of the red bicycle and watching you ride away. I was nervous too. Then I felt proud when I realized you no longer needed my hand on the seat.",
  );
  const child = await real.getAuthorMemory(b.memoryId, b.contributorToken);
  await ps.attachContribution(
    { memoryId: b.memoryId, ownerToken: b.contributorToken },
    invite.id,
    child.currentPublicationId!,
  );
  await ps.synthesize(auth, invite.id, randomUUID());
  await writeFile(
    out,
    JSON.stringify({
      stage: "complete",
      fictional: true,
      author: a,
      contributor: b,
      comparisonUrl: invite.comparisonUrl,
      inviteUrl: invite.inviteUrl,
      alexPreparedMuseImage: true,
      dadNewMuseImage: true,
      narrationsRecorded: false,
    }),
    { mode: 0o600 },
  );
  await writeFile(
    "tmp/meta-smoke/dad-perspective.webp",
    (await store.readImage(bv.imagePath)).bytes,
  );
  console.log(
    JSON.stringify({
      showcaseReady: true,
      fictional: true,
      differentMusePerspectives: true,
      narration: "record-your-own-voice-in-app",
      newImageCalls: 1,
    }),
  );
})().catch((e) => {
  console.error(e instanceof Error ? e.message : "Showcase preparation failed");
  process.exitCode = 1;
});
