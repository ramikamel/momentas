import { loadEnvConfig } from "@next/env";
import { readFile } from "node:fs/promises";
import { transcribeVoice } from "../src/lib/server/voice";
loadEnvConfig(process.cwd());
async function main() {
  if (!process.argv[2]) throw new Error("Provide a local WAV fixture path.");
  if (process.env.E2E_TEST_MODE)
    throw new Error("Live check must not use fixtures.");
  const started = Date.now();
  const wav = new Uint8Array(await readFile(process.argv[2]));
  const result = await transcribeVoice(wav);
  console.log(
    JSON.stringify({
      voiceTranscription: true,
      characters: result.transcript.length,
      durationMs: result.audioDurationMs,
      seconds: (Date.now() - started) / 1000,
      transcriptLogged: false,
    }),
  );
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : "Voice check failed");
  process.exitCode = 1;
});
