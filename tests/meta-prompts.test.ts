import { afterEach, expect, it, vi } from "vitest";
import { getAiProvider } from "@/lib/server/meta";
import type { ApprovedScene } from "@/lib/memory/types";

const scene: ApprovedScene = {
  confirmed: true,
  authorAdditions: "The bicycle was red.",
  plan: {
    setting: { text: "An empty parking lot", sourceQuote: "empty parking lot" },
    people: [{ text: "Dad", sourceQuote: "Dad" }],
    details: [],
    perspective: { text: "The lot felt enormous", sourceQuote: "felt enormous" },
    feelings: [],
    followUpQuestions: [],
  },
};
const b64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

// These exercise the actual provider payload, so a missing directive on either
// generation or reference-image editing is caught without spending API credit.
it.each(["generate", "edit"] as const)("sends the photography default to Muse for %s while keeping approved details", async (operation) => {
  vi.stubEnv("MODEL_API_KEY", "test-only-key");
  vi.stubEnv("E2E_TEST_MODE", "");
  const requests: { path: string; body: { prompt: string; images?: unknown[] } }[] = [];
  vi.stubGlobal("fetch", async (url: string, options: RequestInit) => {
    requests.push({ path: new URL(url).pathname, body: JSON.parse(options.body as string) });
    return Response.json({ data: [{ b64_json: b64 }] });
  });
  const ai = getAiProvider();
  const result = operation === "generate"
    ? await ai.generateImage(scene)
    : await ai.editImage({ bytes: Buffer.from(b64, "base64"), mimeType: "image/png" }, scene, "Put Dad farther behind me.");
  expect(result.mimeType).toBe("image/png");
  expect(requests).toHaveLength(1);
  const request = requests[0];
  expect(request.path).toBe(`/v1/images/${operation === "generate" ? "generations" : "edits"}`);
  expect(request.body.prompt).toMatch(/photorealistic candid photograph/i);
  expect(request.body.prompt).toMatch(/natural.*light/i);
  expect(request.body.prompt).toContain("An empty parking lot");
  expect(request.body.prompt).toContain("The bicycle was red.");
  expect(request.body.prompt).toContain("The lot felt enormous");
  expect(request.body.prompt).toMatch(/subjective memory/i);
  expect(request.body.prompt).toMatch(/each person only once/i);
  if (operation === "edit") {
    expect(request.body.images).toHaveLength(1);
    expect(request.body.prompt).toContain("Put Dad farther behind me.");
    expect(request.body.prompt).toMatch(/reference.*illustrated.*photographic/is);
    expect(request.body.prompt).toMatch(/preserve.*composition/is);
  }
});

it("sends named reference photographs through the edit endpoint", async () => {
  vi.stubEnv("MODEL_API_KEY", "test-only-key");
  vi.stubEnv("E2E_TEST_MODE", "");
  const requests: { path: string; body: { prompt: string; images?: unknown[] } }[] = [];
  vi.stubGlobal("fetch", async (url: string, options: RequestInit) => {
    requests.push({ path: new URL(url).pathname, body: JSON.parse(options.body as string) });
    return Response.json({ data: [{ b64_json: b64 }] });
  });
  const reference = {
    name: "Dad",
    kind: "person" as const,
    image: { bytes: Buffer.from(b64, "base64"), mimeType: "image/jpeg" },
  };
  await getAiProvider().generateImage(scene, [reference]);
  expect(requests[0].path).toBe("/v1/images/edits");
  expect(requests[0].body.images).toHaveLength(1);
  expect(requests[0].body.prompt).toContain("Person named “Dad”");
  expect(requests[0].body.prompt).toContain("An empty parking lot");
});
