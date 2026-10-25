import { randomUUID } from "node:crypto";
import sharp from "sharp";
import {
  buildObjectPrompt,
  decodeMaskToSVGPath,
  decodeMaskToRaster,
  parseImageStream,
  recordsOfKind,
  type ResponsesEvent,
} from "@meta-sam/parser";
import type { AuthorAuth, PublicPin } from "@/lib/memory/connections";
import type { GeneratedImage, Store } from "@/lib/memory/types";
import { outlineSchema } from "@/lib/memory/pins";
import { requireAuthor } from "./authorization";
import { AppError } from "./access";
export type ObjectOutline = NonNullable<PublicPin["outline"]>;
type Point = { x: number; y: number };
export function pixelPoint(
  x: number,
  y: number,
  width: number,
  height: number,
) {
  if (
    ![x, y].every(Number.isFinite) ||
    x < 0 ||
    x > 1 ||
    y < 0 ||
    y > 1 ||
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1
  )
    throw new Error("Invalid point");
  return {
    x: Math.min(width - 1, Math.floor(x * width)),
    y: Math.min(height - 1, Math.floor(y * height)),
  };
}
function simplify(points: Point[], tolerance: number): Point[] {
  if (points.length < 3) return points;
  const first = points[0],
    last = points.at(-1)!;
  let max = 0,
    index = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i],
      dx = last.x - first.x,
      dy = last.y - first.y;
    const t = Math.max(
      0,
      Math.min(
        1,
        ((p.x - first.x) * dx + (p.y - first.y) * dy) /
          (dx * dx + dy * dy || 1),
      ),
    );
    const d = (p.x - first.x - t * dx) ** 2 + (p.y - first.y - t * dy) ** 2;
    if (d > max) {
      max = d;
      index = i;
    }
  }
  return max > tolerance * tolerance
    ? [
        ...simplify(points.slice(0, index + 1), tolerance).slice(0, -1),
        ...simplify(points.slice(index), tolerance),
      ]
    : [first, last];
}
export async function objectsFromText(
  text: string,
  width: number,
  height: number,
  label = "object",
): Promise<import("@/lib/memory/personalization").DetectedObject[]> {
  if (
    text.length > 1024 * 1024 ||
    width < 1 ||
    height < 1 ||
    width > 1024 ||
    height > 1024
  )
    throw new Error("Outline too large");
  async function* events(): AsyncIterable<ResponsesEvent> {
    const lane = { item_id: "outline", output_index: 0, content_index: 0 };
    yield { type: "response.output_text.delta", ...lane, delta: text };
    yield { type: "response.output_text.done", ...lane, text };
    yield { type: "response.completed" };
  }
  const result = await parseImageStream(events()).finalResult;
  if (result.diagnostics.some((d) => d.severity === "error"))
    throw new Error("Invalid segmentation");
  const objects: import("@/lib/memory/personalization").DetectedObject[] = [];
  for (const record of recordsOfKind(result.records, "mask")) {
    const b = record.bounds;
    if (
      b.left < 0 ||
      b.top < 0 ||
      b.right > width ||
      b.bottom > height ||
      record.mask.width * record.mask.height > 1024 * 1024
    )
      throw new Error("Invalid mask bounds");
    const raw = decodeMaskToSVGPath(record.mask);
    const paths: string[] = [];
    for (const contour of raw.split(/(?=M)/)) {
      const n = contour.match(/-?\d+(?:\.\d+)?/g)?.map(Number) || [];
      if (n.length < 6) continue;
      const points: Point[] = [];
      for (let i = 0; i < n.length; i += 2)
        points.push({ x: n[i] + b.left, y: n[i + 1] + b.top });
      // Split a closed contour at its furthest point before simplifying it.
      let split = 1;
      for (let i = 2; i < points.length; i++)
        if (
          (points[i].x - points[0].x) ** 2 + (points[i].y - points[0].y) ** 2 >
          (points[split].x - points[0].x) ** 2 +
            (points[split].y - points[0].y) ** 2
        )
          split = i;
      const simplified = [
        ...simplify(points.slice(0, split + 1), 1.5).slice(0, -1),
        ...simplify([...points.slice(split), points[0]], 1.5).slice(0, -1),
      ];
      if (simplified.length < 3) continue;
      paths.push(
        simplified
          .map(
            (p, i) =>
              `${i ? "L" : "M"}${Math.round(Math.max(0, Math.min(1000, (p.x / width) * 1000)))},${Math.round(Math.max(0, Math.min(1000, (p.y / height) * 1000)))}`,
          )
          .join("") + "Z",
      );
    }
    if (!paths.length) continue;
    const raster = decodeMaskToRaster(record.mask);
    const area =
      raster.reduce((n, value) => n + (value ? 1 : 0), 0) / (width * height);
    objects.push({
      id: `${label}-${record.objectId}`,
      label,
      x: (b.left + b.right) / (2 * width),
      y: (b.top + b.bottom) / (2 * height),
      area,
      outline: outlineSchema.parse({ path: paths.join("") }),
    });
  }
  return objects;
}
export async function outlineFromText(
  text: string,
  width: number,
  height: number,
): Promise<ObjectOutline | null> {
  return (
    (await objectsFromText(text, width, height)).find(
      (o) => o.id === "object-1",
    )?.outline ?? null
  );
}
export async function segmentImage(
  image: GeneratedImage,
  x: number | string,
  y = 0,
): Promise<
  ObjectOutline | import("@/lib/memory/personalization").DetectedObject[] | null
> {
  if (!process.env.MODEL_API_KEY)
    throw new AppError(
      "Object outlines are unavailable. You can still save a pin.",
      503,
    );
  const { data, info } = await sharp(image.bytes, {
    limitInputPixels: 20000000,
  })
    .rotate()
    .resize({
      width: 768,
      height: 768,
      fit: "inside",
      withoutEnlargement: true,
    })
    .png()
    .toBuffer({ resolveWithObject: true });
  const point =
    typeof x === "number" ? pixelPoint(x, y, info.width, info.height) : null;
  const prompt =
    typeof x === "string"
      ? x
      : buildObjectPrompt({
          size: { width: info.width, height: info.height },
          objects: [{ id: 1, prompts: [{ points: [point!] }] }],
        });
  const r = await fetch(
    `${(process.env.META_BASE_URL || "https://api.meta.ai/v1").replace(/\/$/, "")}/responses`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.MODEL_API_KEY}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(30000),
      body: JSON.stringify({
        model: "sam-3.1",
        stream: false,
        input: [
          {
            type: "message",
            role: "user",
            content: [
              { type: "input_text", text: prompt },
              {
                type: "input_image",
                image_url: `data:image/png;base64,${data.toString("base64")}`,
              },
            ],
          },
        ],
        metadata: { mask_encoding: "one_bit" },
      }),
    },
  );
  if (!r.ok) {
    await r.body?.cancel();
    throw new AppError(
      "We couldn’t outline that object. You can still save a pin.",
      r.status === 429 ? 429 : 502,
    );
  }
  const reader = r.body?.getReader();
  if (!reader) throw new Error("Empty response");
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 2 * 1024 * 1024) {
        await reader.cancel();
        throw new Error("Response too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const result = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (result.status !== "completed") throw new Error("Incomplete segmentation");
  const text = (result.output || [])
    .flatMap(
      (o: { content?: { type: string; text?: string }[] }) => o.content || [],
    )
    .filter((c: { type: string }) => c.type === "output_text")
    .map((c: { text: string }) => c.text)
    .join("");
  return typeof x === "string"
    ? objectsFromText(text, info.width, info.height, x)
    : outlineFromText(text, info.width, info.height);
}
export class SegmentationService {
  constructor(
    private store: Store,
    private provider: (
      image: GeneratedImage,
      x: number,
      y: number,
    ) => Promise<ObjectOutline | null> = async (image, x, y) =>
      (await segmentImage(image, x, y)) as ObjectOutline | null,
  ) {}
  async select(auth: AuthorAuth, versionId: string, x: number, y: number) {
    await requireAuthor(this.store, auth);
    const v = (await this.store.versions(auth.memoryId)).find(
      (v) => v.id === versionId,
    );
    if (!v) throw new AppError("Image not found.", 404);
    pixelPoint(x, y, 1, 1);
    if (process.env.E2E_TEST_MODE === "1") {
      if (process.env.NODE_ENV === "production")
        throw new AppError("Test mode is unavailable.", 503);
      return null;
    }
    const requestId = randomUUID();
    try {
      await this.store.reserveDetailOutline(
        auth.memoryId,
        versionId,
        requestId,
      );
    } catch (e) {
      const status = (e as { status?: number }).status;
      throw new AppError(
        status === 429
          ? "Object outline limit reached. You can still save this detail as a pin."
          : "Object outlines are temporarily unavailable. You can still save this detail as a pin.",
        status === 429 ? 429 : 503,
      );
    }
    let success = false;
    try {
      const outline = await this.provider(
        await this.store.readImage(v.imagePath),
        x,
        y,
      );
      success = true;
      return outline;
    } catch (e) {
      if (e instanceof AppError) throw e;
      throw new AppError(
        "We couldn’t outline that object. You can still save a pin.",
        502,
      );
    } finally {
      // A failed finalization leaves a reservation that expires; its budget is
      // already consumed, and it must never turn a successful outline into a retry.
      await this.store
        .finishDetailOutline(auth.memoryId, versionId, requestId, success)
        .catch(() => {});
    }
  }
}
