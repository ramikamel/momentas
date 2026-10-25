import { loadEnvConfig } from "@next/env";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { getAiProvider } from "../src/lib/server/meta";

loadEnvConfig(process.cwd());
async function main() {
  const ai = getAiProvider();
  if (!ai.configured)
    throw new Error(
      "Configure MODEL_API_KEY before running this explicit live check.",
    );
  if (process.env.E2E_TEST_MODE === "1")
    throw new Error("Live check must not use the test provider.");
  const story =
    "This is a fictional sample memory. I was seven, learning to ride my red bicycle in an empty parking lot on a warm afternoon. Dad held the back of the seat. The parking lot felt enormous to me. When I looked back, he was standing far behind me, smiling with his hands in the air. I felt scared for a moment, then proud when I realized I was riding by myself.";
  const start = Date.now();
  const plan = await ai.extractScene(story);
  console.log(
    JSON.stringify({
      stage: "scene",
      success: true,
      seconds: (Date.now() - start) / 1000,
    }),
  );
  const scene = {
    plan,
    authorAdditions: "The child sees the parking lot as enormous.",
    confirmed: true as const,
  };
  const initialStart = Date.now(),
    image = await ai.generateImage(scene);
  const folder = resolve("tmp/meta-smoke");
  await mkdir(folder, { recursive: true });
  await writeFile(
    resolve(folder, `initial.${image.mimeType.split("/")[1]}`),
    image.bytes,
  );
  console.log(
    JSON.stringify({
      stage: "generate",
      success: true,
      seconds: (Date.now() - initialStart) / 1000,
      bytes: image.bytes.length,
      path: `tmp/meta-smoke/initial.${image.mimeType.split("/")[1]}`,
    }),
  );
  const editStart = Date.now();
  const edited = await ai.editImage(
    image,
    scene,
    "Make the parking lot feel much bigger, and put Dad farther behind the child. Preserve the red bicycle, the warm afternoon, and the storybook style.",
  );
  await writeFile(
    resolve(folder, `edited.${edited.mimeType.split("/")[1]}`),
    edited.bytes,
  );
  await writeFile(
    resolve(folder, "scene.json"),
    JSON.stringify(scene, null, 2),
  );
  console.log(
    JSON.stringify({
      stage: "edit",
      success: true,
      seconds: (Date.now() - editStart) / 1000,
      bytes: edited.bytes.length,
      path: `tmp/meta-smoke/edited.${edited.mimeType.split("/")[1]}`,
    }),
  );
}
main().catch((error) => {
  console.error(
    JSON.stringify({
      success: false,
      message: error instanceof Error ? error.message : "Live check failed",
      status: error?.status,
      code: error?.code,
    }),
  );
  process.exitCode = 1;
});
