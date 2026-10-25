import { afterEach, expect, it, vi } from "vitest";
import sharp from "sharp";
import { ObjectMapService } from "@/lib/server/object-map";
import { objectsFromText, segmentImage } from "@/lib/server/segmentation";
import { hashToken } from "@/lib/server/access";
import type { Store } from "@/lib/memory/types";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
function setup() {
  let map: unknown = null;
  const store = {
    getMemory: vi.fn(async () => ({ authorTokenHash: hashToken("owner") })),
    versions: vi.fn(async () => [{ id: "v", imagePath: "m/v.png" }]),
    getObjectMap: vi.fn(async () => map),
    claimObjectMap: vi.fn(async () =>
      map
        ? { claimed: false, map }
        : { claimed: true, map: { status: "pending", objects: [] } },
    ),
    saveObjectMap: vi.fn(async (_m, _v, _j, objects, status) => {
      map = { objects, status };
    }),
    readImage: vi.fn(async () => ({
      bytes: new Uint8Array(),
      mimeType: "image/png",
    })),
    reserveOutlineBatch: vi.fn(),
    reserveDetailOutline: vi.fn(),
    finishDetailOutline: vi.fn(async () => {}),
  };
  return {
    store,
    service: new ObjectMapService(
      store as unknown as Store,
      vi.fn(async () => ["helmet"]),
      vi.fn(async () => []),
    ),
  };
}
it("authorizes owner and version before reading a map or making calls", async () => {
  const { store, service } = setup();
  await expect(
    service.get({ memoryId: "m", ownerToken: "wrong" }, "v"),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    service.prepare({ memoryId: "m", ownerToken: "owner" }, "foreign"),
  ).rejects.toMatchObject({ status: 404 });
  expect(store.getObjectMap).not.toHaveBeenCalled();
  expect(store.claimObjectMap).not.toHaveBeenCalled();
  expect(store.readImage).not.toHaveBeenCalled();
});
it("GET reads only; cached complete and failed maps never pay again", async () => {
  const { store, service } = setup(),
    auth = { memoryId: "m", ownerToken: "owner" };
  await service.get(auth, "v");
  expect(store.claimObjectMap).not.toHaveBeenCalled();
  expect(store.reserveOutlineBatch).not.toHaveBeenCalled();
  await service.prepare(auth, "v");
  await service.prepare(auth, "v");
  expect(store.reserveOutlineBatch).toHaveBeenCalledTimes(1);
  expect(store.finishDetailOutline).toHaveBeenCalledTimes(6);
});
it("reserves before vision; failed preparation is cached without refresh retry", async () => {
  const { store } = setup(),
    suggest = vi.fn(async () => {
      throw new Error("private provider failure");
    }),
    service = new ObjectMapService(store as unknown as Store, suggest),
    auth = { memoryId: "m", ownerToken: "owner" };
  store.reserveOutlineBatch.mockImplementation(async () => {
    expect(suggest).not.toHaveBeenCalled();
  });
  await expect(service.prepare(auth, "v")).resolves.toMatchObject({
    status: "failed",
  });
  await service.prepare(auth, "v");
  expect(suggest).toHaveBeenCalledTimes(1);
  expect(store.finishDetailOutline).toHaveBeenCalledTimes(6);
});
it("helmet uses SAM noun concept alone without a point prompt", async () => {
  vi.stubEnv("MODEL_API_KEY", "test");
  const fetcher = vi.fn(
    async (_url: string | URL | Request, _init?: RequestInit) => {
      void _url;
      void _init;
      return Response.json({ status: "completed", output: [] });
    },
  );
  vi.stubGlobal("fetch", fetcher);
  const bytes = await sharp({
    create: { width: 8, height: 8, channels: 3, background: "white" },
  })
    .png()
    .toBuffer();
  await expect(
    segmentImage({ bytes, mimeType: "image/png" }, "helmet"),
  ).resolves.toEqual([]);
  const body = JSON.parse(fetcher.mock.calls[0][1]!.body as string);
  expect(body.input[0].content[0]).toEqual({
    type: "input_text",
    text: "helmet",
  });
  expect(body.model).toBe("sam-3.1");
});
it("retains concept mask IDs zero and one as separate selectable objects", async () => {
  const text =
    "<0f>0<|box;x1=211;y1=228;x2=270;y2=254;w=320;h=334|>" +
    "<|mask;x=0;y=0;data=27,60,~!!!!M!0c[0o91w?q1!pIH4pPRVp2B3'7`e.ioeAf6-k/#Xd8%dX9x(|>" +
    ",1<|box;x1=155;y1=228;x2=202;y2=254;w=320;h=334|>" +
    "<|mask;x=0;y=0;data=27,48,~!!!!J!0c[q=Pj_zs=*4C4(/./x#:/`S_GnD`=o3?X{emCgO$y@|>\n";
  const objects = await objectsFromText(text, 320, 334, "button");
  expect(objects.map((o) => o.id)).toEqual(["button-0", "button-1"]);
  for (const object of objects) {
    expect(object.area).toBeGreaterThan(0);
    expect(object.outline.path).toMatch(/^M/);
    expect(object.x).toBeGreaterThan(0);
  }
});
it("bounds cached maps to 30 unique objects with smallest details first", async () => {
  const { store } = setup();
  const object = (id: string, area: number, label = "chair") => ({
    id,
    label,
    area,
    x: 0.5,
    y: 0.5,
    outline: { path: "M0,0L1,0L1,1Z" },
  });
  const segment = vi.fn(async () => [
    ...Array.from({ length: 35 }, (_, i) => object(`chair-${i}`, 1 - i / 100)),
    object("helmet-0", 0.001, "helmet"),
    object("helmet-0", 0.001, "helmet"),
  ]);
  const service = new ObjectMapService(
    store as unknown as Store,
    async () => ["chair"],
    segment,
  );
  const result = await service.prepare(
    { memoryId: "m", ownerToken: "owner" },
    "v",
  );
  expect(result?.objects).toHaveLength(30);
  expect(result?.objects[0].id).toBe("helmet-0");
  expect(new Set(result?.objects.map((o) => o.id)).size).toBe(30);
  expect(result?.objects[1].id).toBe("chair-34");
});
it("SAM requests leave at least 45 seconds for map persistence within the lease", async () => {
  vi.stubEnv("MODEL_API_KEY", "test");
  const timeout = vi.spyOn(AbortSignal, "timeout");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ status: "completed", output: [] })),
  );
  const bytes = await sharp({
    create: { width: 8, height: 8, channels: 3, background: "white" },
  })
    .png()
    .toBuffer();
  await segmentImage({ bytes, mimeType: "image/png" }, "helmet");
  expect(timeout).toHaveBeenCalledWith(30000);
  timeout.mockRestore();
});

it("keeps successful masks and continues discovery when another concept fails", async () => {
  const { store } = setup();
  const found = {
    id: "helmet-0",
    label: "helmet",
    area: 0.03,
    x: 0.5,
    y: 0.2,
    outline: { path: "M0,0L100,0L100,100Z" },
  };
  const segment = vi.fn(async (_image, concept: string) => {
    if (concept === "person") throw Error("timeout");
    return [{ ...found, id: `${concept}-0`, label: concept }];
  });
  const service = new ObjectMapService(
    store as unknown as Store,
    async () => ["person", "helmet", "bicycle", "shoe"],
    segment,
  );
  const map = await service.prepare(
    { memoryId: "m", ownerToken: "owner" },
    "v",
  );
  expect(map?.status).toBe("complete");
  expect(map?.objects.map((o) => o.label).sort()).toEqual([
    "bicycle",
    "helmet",
    "shoe",
  ]);
});

it("treats truncated vision output as a failure instead of caching an empty map", async () => {
  vi.stubEnv("MODEL_API_KEY", "test");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        choices: [{ finish_reason: "length", message: { content: "" } }],
      }),
    ),
  );
  const { suggestObjects } = await import("@/lib/server/object-map");
  await expect(
    suggestObjects({ bytes: new Uint8Array(), mimeType: "image/png" }),
  ).rejects.toThrow();
});

it("preserves usable cached outlines when a requested refresh cannot reserve capacity", async () => {
  const { store } = setup();
  const previous = {
    id: "helmet-0",
    label: "helmet",
    area: 0.03,
    x: 0.5,
    y: 0.2,
    outline: { path: "M0,0L100,0L100,100Z" },
  };
  store.getObjectMap.mockResolvedValue({
    status: "complete",
    objects: [previous],
  });
  store.reserveOutlineBatch.mockRejectedValue(Error("capacity reached"));
  const service = new ObjectMapService(store as unknown as Store, async () => [
    "helmet",
  ]);
  await service.prepare({ memoryId: "m", ownerToken: "owner" }, "v", true);
  expect(store.saveObjectMap).toHaveBeenLastCalledWith(
    "m",
    "v",
    expect.any(String),
    [previous],
    "failed",
  );
});
