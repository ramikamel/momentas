import { describe, expect, it } from "vitest";
import {
  assertSameOrigin,
  createToken,
  hashToken,
  matchesToken,
  shareTokenFor,
} from "@/lib/server/access";

describe("capabilities and mutation origins", () => {
  it("preserves the v1 share-link derivation after a project rename", () => {
    expect(shareTokenFor("fixed-author-capability", "fixed-memory-id")).toBe("VAY09rMDniupot-skeVfpBUb3DGo9P8Tdw40100M11w");
  });
  it("creates high-entropy secrets, stores hashes, and separates share from author capability", () => {
    const token = createToken();
    expect(Buffer.from(token, "base64url").length).toBe(32);
    expect(hashToken(token)).not.toBe(token);
    expect(matchesToken(token, hashToken(token))).toBe(true);
    expect(matchesToken(createToken(), hashToken(token))).toBe(false);
    expect(matchesToken(token, "invalid")).toBe(false);
    const share = shareTokenFor(token, "memory-1");
    expect(share).not.toBe(token);
    expect(matchesToken(share, hashToken(token))).toBe(false);
    expect(shareTokenFor(token, "memory-1")).toBe(share);
    expect(shareTokenFor(token, "memory-2")).not.toBe(share);
  });
  it("requires an exact same-origin request and rejects missing or cross-site origin", () => {
    expect(() =>
      assertSameOrigin(
        new Request("http://localhost:3000/api/memories", {
          headers: { origin: "http://localhost:3000" },
        }),
      ),
    ).not.toThrow();
    expect(() =>
      assertSameOrigin(
        new Request("http://localhost:3000/api/memories", {
          headers: { origin: "https://evil.example" },
        }),
      ),
    ).toThrow();
    expect(() =>
      assertSameOrigin(new Request("http://localhost:3000/api/memories")),
    ).toThrow();
  });
});
