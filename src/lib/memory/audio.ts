export const VOICE_RATE = 24000;
export const MAX_WAV_BYTES = 2880044;
/** Only accept our canonical 44-byte RIFF header, with no ancillary chunks. */
export function validateWav(bytes: Uint8Array): { durationMs: number } {
  const invalid = () => {
    throw new Error("Record a mono PCM16 WAV at 24 kHz, lasting 1–60 seconds.");
  };
  if (bytes.length < 44 || bytes.length > MAX_WAV_BYTES) return invalid();
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (p: number) => String.fromCharCode(...bytes.subarray(p, p + 4));
  const frames = (bytes.length - 44) / 2;
  if (
    tag(0) !== "RIFF" ||
    tag(8) !== "WAVE" ||
    tag(12) !== "fmt " ||
    tag(36) !== "data" ||
    v.getUint32(4, true) !== bytes.length - 8 ||
    v.getUint32(16, true) !== 16 ||
    v.getUint16(20, true) !== 1 ||
    v.getUint16(22, true) !== 1 ||
    v.getUint32(24, true) !== VOICE_RATE ||
    v.getUint32(28, true) !== 48000 ||
    v.getUint16(32, true) !== 2 ||
    v.getUint16(34, true) !== 16 ||
    v.getUint32(40, true) !== bytes.length - 44 ||
    !Number.isInteger(frames) ||
    frames < 24000 ||
    frames > 1440000
  )
    return invalid();
  return { durationMs: Math.round(frames / 24) };
}
export function encodeWav(samples: Float32Array): Uint8Array {
  const length = Math.min(samples.length, VOICE_RATE * 60),
    bytes = new Uint8Array(44 + length * 2),
    v = new DataView(bytes.buffer);
  const tag = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++)
      bytes[offset + i] = text.charCodeAt(i);
  };
  tag(0, "RIFF");
  v.setUint32(4, bytes.length - 8, true);
  tag(8, "WAVE");
  tag(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, VOICE_RATE, true);
  v.setUint32(28, VOICE_RATE * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  tag(36, "data");
  v.setUint32(40, length * 2, true);
  for (let i = 0; i < length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i] || 0));
    v.setInt16(44 + i * 2, s < 0 ? s * 32768 : s * 32767, true);
  }
  return bytes;
}
export async function normalizeRecording(blob: Blob): Promise<Uint8Array> {
  const context = new AudioContext();
  try {
    const decoded = await context.decodeAudioData(await blob.arrayBuffer());
    const frames = Math.min(
      Math.floor(decoded.duration * VOICE_RATE),
      VOICE_RATE * 60,
    );
    if (frames < VOICE_RATE)
      throw new Error("Please record at least one second.");
    const offline = new OfflineAudioContext(1, frames, VOICE_RATE);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start();
    return encodeWav((await offline.startRendering()).getChannelData(0));
  } finally {
    await context.close();
  }
}
