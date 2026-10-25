import { loadEnvConfig } from "@next/env";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { getStore } from "../src/lib/server/store";
import { getAiProvider } from "../src/lib/server/meta";
import { MemoryService } from "../src/lib/server/memories";
import type { ApprovedScene, ImageVersion } from "../src/lib/memory/types";

loadEnvConfig(process.cwd());
async function main() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)
    throw new Error("Supabase credentials required.");
  const store = getStore(),
    service = new MemoryService(store, getAiProvider());
  const scene = JSON.parse(
    await readFile("tmp/meta-smoke/scene.json", "utf8"),
  ) as ApprovedScene;
  const story =
    "This is a fictional sample memory. I was seven, learning to ride my red bicycle in an empty parking lot on a warm afternoon. Dad held the back of the seat. The parking lot felt enormous to me. When I looked back, he was standing far behind me, smiling with his hands in the air. I felt scared for a moment, then proud when I realized I was riding by myself.";
  const { id, authorToken } = await service.createMemory({
    title: "The day you let go",
    authorName: "Alex",
    recipientName: "Dad",
    story,
    scenePlan: scene.plan,
  });
  let parent: string | null = null;
  for (const name of ["initial", "edited"]) {
    const requestId = randomUUID(),
      versionId = randomUUID();
    await store.reserveRender(id, requestId, 24);
    const bytes = new Uint8Array(await readFile(`tmp/meta-smoke/${name}.webp`));
    const imagePath = `${id}/${versionId}.webp`;
    await store.putImage(imagePath, { bytes, mimeType: "image/webp" });
    const version: ImageVersion = {
      id: versionId,
      memoryId: id,
      parentVersionId: parent,
      imagePath,
      scene,
      instruction:
        name === "edited"
          ? "Make the parking lot feel bigger and put Dad farther behind me."
          : null,
      createdAt: new Date().toISOString(),
    };
    await store.completeRender(id, requestId, version);
    const reread = await store.readImage(imagePath);
    if (!Buffer.from(bytes).equals(Buffer.from(reread.bytes)))
      throw new Error("Storage image round-trip mismatch.");
    const signed = await store.imageUrl(imagePath, id, versionId);
    const result = await fetch(signed);
    if (!result.ok) throw new Error("Signed image URL could not be read.");
    console.log(
      JSON.stringify({
        stage: `storage-${name}`,
        success: true,
        bytes: bytes.length,
      }),
    );
    parent = versionId;
  }
  const { shareUrl } = await service.publishMemory(
    id,
    authorToken,
    parent!,
    "A fictional sample: I remember the parking lot feeling enormous. When I looked back, you had let go, and I was riding all by myself.",
  );
  const token = shareUrl.split("/").at(-1)!;
  const q = await service.postRecipientMessage(token, {
    versionId: parent!,
    displayName: "Dad (sample)",
    text: "Were you scared when you realized I had let go?",
  });
  await service.postStorytellerReply(
    id,
    authorToken,
    q.id,
    "Sample reply: for a moment, then I realized I could do it myself.",
  );
  const shared = await service.getSharedMemory(token);
  if (shared.messages.length !== 2 || "story" in shared)
    throw new Error("Shared projection mismatch.");
  await mkdir(".data", { recursive: true });
  await writeFile(
    ".data/live-demo.json",
    JSON.stringify({ id, authorToken, shareUrl, prepared: true }),
    { mode: 0o600 },
  );
  console.log(
    JSON.stringify({
      stage: "publish-and-human-messages",
      success: true,
      shareUrl,
      prepared: true,
    }),
  );
}
main().catch((error) => {
  console.error(
    JSON.stringify({
      success: false,
      message: error instanceof Error ? error.message : "Storage check failed",
    }),
  );
  process.exitCode = 1;
});
