import { describe, expect, it } from "vitest";
import { encodeWav, validateWav } from "../src/lib/memory/audio";
describe("canonical voice audio", () => {
  it("encodes mono PCM16 24k and measures actual frames", () => {
    const wav = encodeWav(new Float32Array(24000));
    expect(wav.length).toBe(48044);
    expect(validateWav(wav).durationMs).toBe(1000);
  });
  it("rejects malformed, short, wrong-rate and overlong recordings", () => {
    expect(() => validateWav(new Uint8Array(44))).toThrow();
    expect(() => validateWav(encodeWav(new Float32Array(23999)))).toThrow();
    const wav = encodeWav(new Float32Array(24000));
    new DataView(wav.buffer).setUint32(24, 16000, true);
    expect(() => validateWav(wav)).toThrow();
    expect(() => validateWav(new Uint8Array(2880045))).toThrow();
  });
  it("clamps samples and trims to sixty seconds", () => {
    expect(encodeWav(new Float32Array(24000 * 61)).length).toBe(2880044);
  });
});
