import { AppError } from "./access";
import { validateWav } from "../memory/audio";
export async function transcribeVoice(
  wav: Uint8Array,
): Promise<{ transcript: string; audioDurationMs: number }> {
  const { durationMs } = validateWav(wav);
  if (process.env.E2E_TEST_MODE === "1") {
    if (process.env.NODE_ENV === "production")
      throw new AppError("Test mode is unavailable in production.", 503);
    return {
      transcript: "Dad taught me to ride my bike in the parking lot.",
      audioDurationMs: durationMs,
    };
  }
  const key = process.env.MODEL_API_KEY;
  if (!key)
    throw new AppError(
      "Transcription is unavailable. You can still type your memory.",
      503,
      "VOICE_UNAVAILABLE",
    );
  const boundary = `momentas-${crypto.randomUUID()}`;
  const settings = JSON.stringify({
    model: process.env.META_VOICE_MODEL || "muse-voice-transcribe-1.0",
    audioEncoding: "WAV",
    mode: "PUSH_TO_TALK",
  });
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="request"\r\nContent-Type: application/json\r\n\r\n${settings}\r\n--${boundary}\r\nContent-Disposition: form-data; name="audio"; filename="recording.wav"\r\nContent-Type: audio/wav\r\n\r\n`,
    ),
    Buffer.from(wav),
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);

  try {
    const response = await fetch(
      `${(process.env.META_BASE_URL || "https://api.meta.ai/v1").replace(/\/$/, "")}/asr/transcribe`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          Accept: "application/json",
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
        },
        body: new Uint8Array(body),
        signal: AbortSignal.timeout(120000),
      },
    );
    if (!response.ok) throw new Error("provider");
    const result = await response.json();
    if (
      typeof result.transcript !== "string" ||
      !result.transcript.trim() ||
      result.transcript.length > 30000 ||
      typeof result.audioDurationMs !== "number" ||
      !Number.isFinite(result.audioDurationMs)
    )
      throw new Error("response");
    return {
      transcript: result.transcript,
      audioDurationMs: result.audioDurationMs,
    };
  } catch {
    throw new AppError(
      "Transcription is unavailable. Your recording is saved; retry or type your memory.",
      503,
      "VOICE_UNAVAILABLE",
    );
  }
}
