import { afterEach, expect, it, vi } from "vitest";
import { transcribeVoice } from "../src/lib/server/voice";
import { encodeWav } from "../src/lib/memory/audio";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it("uses documented multipart voice API and preserves original transcript", async () => {
  vi.stubEnv("MODEL_API_KEY", "test");
  const fetcher = vi.fn(async () =>
    Response.json({ transcript: "My own words.", audioDurationMs: 1000 }),
  );
  vi.stubGlobal("fetch", fetcher);
  expect(await transcribeVoice(encodeWav(new Float32Array(24000)))).toEqual({
    transcript: "My own words.",
    audioDurationMs: 1000,
  });
  const [url, opts] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe("https://api.meta.ai/v1/asr/transcribe");
  const form = await new Response(opts.body, {
    headers: {
      "content-type": (opts.headers as Record<string, string>)["Content-Type"],
    },
  }).formData();
  expect(JSON.parse(String(form.get("request")))).toEqual({
    model: "muse-voice-transcribe-1.0",
    audioEncoding: "WAV",
    mode: "PUSH_TO_TALK",
  });
});
it("hides provider error bodies", async () => {
  vi.stubEnv("MODEL_API_KEY", "test");
  vi.stubGlobal(
    "fetch",
    async () => new Response("secret-provider-body", { status: 500 }),
  );
  await expect(
    transcribeVoice(encodeWav(new Float32Array(24000))),
  ).rejects.toThrow("Transcription is unavailable");
});
