import sharp from "sharp";
import { afterEach, expect, it, vi } from "vitest";
import {
  pixelPoint,
  outlineFromText,
  SegmentationService,
  segmentImage,
} from "@/lib/server/segmentation";
import type { Store } from "@/lib/memory/types";
import { hashToken } from "@/lib/server/access";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it("maps scaled edge clicks to in-bounds media pixels", () => {
  expect(pixelPoint(0.5, 0.25, 768, 512)).toEqual({ x: 384, y: 128 });
  expect(pixelPoint(1, 1, 768, 512)).toEqual({ x: 767, y: 511 });
  for (const x of [-1, NaN, Infinity, 1.1])
    expect(() => pixelPoint(x, 0, 768, 512)).toThrow();
});
it("treats no match as a normal result and rejects malformed or oversized output", async () => {
  expect(await outlineFromText("", 768, 512)).toBeNull();
  await expect(
    outlineFromText("<0f>1<|mask;bad|>", 768, 512),
  ).rejects.toThrow();
  await expect(
    outlineFromText("a".repeat(1024 * 1024 + 1), 768, 512),
  ).rejects.toThrow();
});
it("requires the owner and correct saved version before image access or a paid call", async () => {
  const provider = vi.fn(),
    readImage = vi.fn();
  const store = {
    getMemory: vi.fn(async () => ({ authorTokenHash: hashToken("owner") })),
    versions: vi.fn(async () => [{ id: "mine", imagePath: "m/v.png" }]),
    readImage,
  } as unknown as Store;
  const service = new SegmentationService(store, provider);
  await expect(
    service.select({ memoryId: "m", ownerToken: "stranger" }, "mine", 0.5, 0.5),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    service.select({ memoryId: "m", ownerToken: "owner" }, "foreign", 0.5, 0.5),
  ).rejects.toMatchObject({ status: 404 });
  expect(readImage).not.toHaveBeenCalled();
  expect(provider).not.toHaveBeenCalled();
});
it("hides private provider error bodies and makes a single bounded point request", async () => {
  vi.stubEnv("MODEL_API_KEY", "test");
  const fetcher = vi.fn(
    async () => new Response("private-source-data", { status: 503 }),
  );
  vi.stubGlobal("fetch", fetcher);
  const image = {
    bytes: await sharp({
      create: { width: 1, height: 1, channels: 3, background: "#ffffff" },
    })
      .png()
      .toBuffer(),
    mimeType: "image/png",
  };
  await expect(segmentImage(image, 0.5, 0.5)).rejects.toThrow(
    "couldn’t outline",
  );
  expect(fetcher).toHaveBeenCalledTimes(1);
  const [url, opts] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toMatch(/\/responses$/);
  const body = JSON.parse(String(opts.body));
  expect(body.model).toBe("sam-3.1");
  expect(body.input[0].content[0].text).toContain("<|point;x=0;y=0;w=1;h=1|>");
});

it("reserves before the provider, finalizes successful calls, and stops paid calls when quota is exhausted", async () => {
  const provider = vi.fn(async () => null),
    finishDetailOutline = vi.fn(async () => {}),
    reserveDetailOutline = vi.fn(async () => {});
  const store = {
    getMemory: vi.fn(async () => ({ authorTokenHash: hashToken("owner") })),
    versions: vi.fn(async () => [{ id: "mine", imagePath: "m/v.png" }]),
    readImage: vi.fn(async () => ({
      bytes: new Uint8Array(),
      mimeType: "image/png",
    })),
    reserveDetailOutline,
    finishDetailOutline,
  } as unknown as Store;
  const service = new SegmentationService(store, provider);
  await expect(
    service.select(
      { memoryId: "test-owner", ownerToken: "owner" },
      "mine",
      0.5,
      0.5,
    ),
  ).resolves.toBeNull();
  expect(reserveDetailOutline).toHaveBeenCalledOnce();
  expect(finishDetailOutline).toHaveBeenCalledWith(
    "test-owner",
    "mine",
    expect.any(String),
    true,
  );
  reserveDetailOutline.mockRejectedValueOnce(
    Object.assign(new Error("quota"), { status: 429 }),
  );
  await expect(
    service.select(
      { memoryId: "test-owner", ownerToken: "owner" },
      "mine",
      0.5,
      0.5,
    ),
  ).rejects.toMatchObject({ status: 429 });
  expect(provider).toHaveBeenCalledTimes(1);
});

it("preserves small visible contours instead of simplifying them away", async () => {
  const { encodeSegmentationMask } = await import(
    "../node_modules/@meta-sam/parser/dist/mask-codec.js"
  );
  const { objectsFromText } = await import("@/lib/server/segmentation");
  const mask = encodeSegmentationMask(new Uint8Array([1, 1, 1, 1]), 2, 2);
  const text = `<0f>0<|box;x1=100;y1=100;x2=101;y2=101;w=1024;h=1024|><|mask;x=0;y=0;data=2,2,${mask.payload}|>`;
  const objects = await objectsFromText(text, 1024, 1024, "bell");
  expect(objects).toHaveLength(1);
  expect(objects[0].area).toBeCloseTo(4 / (1024 * 1024));
});

it("adapts contour detail to keep complex valid masks within saved-outline limits", async () => {
  const { encodeSegmentationMask } = await import(
    "../node_modules/@meta-sam/parser/dist/mask-codec.js"
  );
  const { objectsFromText } = await import("@/lib/server/segmentation");
  const raster = new Uint8Array(1024 * 1024);
  for (let y = 10; y < 1010; y++)
    for (let x = 10; x < 1010; x++)
      raster[y * 1024 + x] = x > 10 + (y % 2) && x < 1010 - (y % 2) ? 1 : 0;
  const mask = encodeSegmentationMask(raster, 1024, 1024);
  const text = `<0f>0<|box;x1=0;y1=0;x2=1023;y2=1023;w=1024;h=1024|><|mask;x=0;y=0;data=1024,1024,${mask.payload}|>`;
  const objects = await objectsFromText(text, 1024, 1024, "shirt");
  expect(objects).toHaveLength(1);
  expect(objects[0].outline.path.length).toBeLessThanOrEqual(16000);
});
