import { randomUUID } from "node:crypto";
import sharp from "sharp";
import {
  buildObjectPrompt,
  decodeMaskToSVGPath,
  parseImageStream,
  recordsOfKind,
  type ResponsesEvent,
} from "@meta-sam/parser";
import type { AuthorAuth, PublicPin } from "@/lib/memory/connections";
import type { GeneratedImage, Store } from "@/lib/memory/types";
import { outlineSchema } from "@/lib/memory/pins";
import { requireAuthor } from "./authorization";
import { AppError } from "./access";
import { z } from "zod";
export type ObjectOutline = NonNullable<PublicPin["outline"]>;
export type VisibleRegion = { id: string; label: string; path: string };
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
async function maskRecords(text: string, width: number, height: number) {
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
  return recordsOfKind(result.records, "mask");
}
function pathForMask(
  record: Awaited<ReturnType<typeof maskRecords>>[number],
  width: number,
  height: number,
) {
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
  return paths.length ? paths.join("") : null;
}
export async function outlineFromText(
  text: string,
  width: number,
  height: number,
): Promise<ObjectOutline | null> {
  const record = (await maskRecords(text, width, height)).find(
    (r) => r.objectId === "1",
  );
  if (!record) return null;
  const path = pathForMask(record, width, height);
  if (!path) return null;
  return outlineSchema.parse({ path });
}
export async function regionsFromText(
  text: string,
  width: number,
  height: number,
  label: string,
): Promise<VisibleRegion[]> {
  const regions: VisibleRegion[] = [];
  for (const record of await maskRecords(text, width, height)) {
    const path = pathForMask(record, width, height);
    if (!path) continue;
    regions.push({
      id: `${label}-${record.objectId}`.replace(/\s+/g, "-"),
      label,
      path: outlineSchema.parse({ path }).path,
    });
  }
  return regions;
}
const conceptSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z][a-z0-9]*(?:[ '-][a-z0-9]+){0,3}$/);
export function conceptPhrases(raw: unknown): string[] {
  const values = z
    .object({ concepts: z.array(z.string()).max(12) })
    .parse(raw).concepts;
  const phrases: string[] = [];
  for (const value of values) {
    const phrase = conceptSchema.safeParse(value);
    if (
      !phrase.success ||
      phrases.includes(phrase.data) ||
      /^(segment|find|show|which|where|what)\b/.test(phrase.data)
    )
      continue;
    phrases.push(phrase.data);
    if (phrases.length === 5) break;
  }
  return phrases;
}
async function preparedImage(image: GeneratedImage) {
  return sharp(Buffer.from(image.bytes), { limitInputPixels: 20000000 })
    .rotate()
    .resize({
      width: 768,
      height: 768,
      fit: "inside",
      withoutEnlargement: true,
    })
    .png()
    .toBuffer({ resolveWithObject: true });
}
async function samText(
  png: Buffer,
  inputText: string,
): Promise<string> {
  if (!process.env.MODEL_API_KEY)
    throw new AppError(
      "Object outlines are unavailable. You can still save a pin.",
      503,
    );
  const r = await fetch(
    `${(process.env.META_BASE_URL || "https://api.meta.ai/v1").replace(/\/$/, "")}/responses`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.MODEL_API_KEY}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(45000),
      body: JSON.stringify({
        model: "sam-3.1",
        stream: false,
        input: [
          {
            type: "message",
            role: "user",
            content: [
              { type: "input_text", text: inputText },
              {
                type: "input_image",
                image_url: `data:image/png;base64,${png.toString("base64")}`,
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
  return (result.output || [])
    .flatMap(
      (o: { content?: { type: string; text?: string }[] }) => o.content || [],
    )
    .filter((c: { type: string }) => c.type === "output_text")
    .map((c: { text: string }) => c.text)
    .join("");
}
export async function segmentImage(
  image: GeneratedImage,
  x: number,
  y: number,
): Promise<ObjectOutline | null> {
  const { data, info } = await preparedImage(image);
  const point = pixelPoint(x, y, info.width, info.height);
  const prompt = buildObjectPrompt({
    size: { width: info.width, height: info.height },
    objects: [{ id: 1, prompts: [{ points: [point] }] }],
  });
  return outlineFromText(
    await samText(data, prompt),
    info.width,
    info.height,
  );
}
export async function listVisibleConcepts(
  image: GeneratedImage,
): Promise<string[]> {
  if (!process.env.MODEL_API_KEY) return [];
  const { data } = await preparedImage(image);
  const result = await fetch(
    `${(process.env.META_BASE_URL || "https://api.meta.ai/v1").replace(/\/$/, "")}/chat/completions`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.MODEL_API_KEY}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(45000),
      body: JSON.stringify({
        model: process.env.META_TEXT_MODEL || "muse-spark-1.3",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Name the distinct visible things in this photograph that a person could point at. Include a separate short noun phrase for a visually distinct part, such as a helmet, hat, glasses, shirt, or bicycle, in addition to the person wearing or riding it. Return at most 5 concepts. Each concept is a noun phrase of at most four words. No commands or sentences.",
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/png;base64,${data.toString("base64")}`,
                },
              },
            ],
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "VisibleThings",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              required: ["concepts"],
              properties: {
                concepts: {
                  type: "array",
                  maxItems: 5,
                  items: { type: "string" },
                },
              },
            },
          },
        },
      }),
    },
  );
  if (!result.ok) {
    await result.body?.cancel();
    return [];
  }
  try {
    const body = (await result.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return conceptPhrases(
      JSON.parse(body.choices?.[0]?.message?.content || "{}"),
    );
  } catch {
    return [];
  }
}
export async function segmentConcept(
  image: GeneratedImage,
  concept: string,
): Promise<VisibleRegion[]> {
  const phrase = conceptPhrases({ concepts: [concept] })[0];
  if (!phrase) return [];
  const { data, info } = await preparedImage(image);
  return regionsFromText(
    await samText(data, phrase),
    info.width,
    info.height,
    phrase,
  );
}
const discovered = new Map<string, Promise<VisibleRegion[]>>();
export class SegmentationService {
  constructor(
    private store: Store,
    private provider = segmentImage,
    private concepts = listVisibleConcepts,
    private conceptSegment = segmentConcept,
  ) {}
  async discover(
    auth: AuthorAuth,
    versionId: string,
  ): Promise<VisibleRegion[]> {
    await requireAuthor(this.store, auth);
    const v = (await this.store.versions(auth.memoryId)).find(
      (item) => item.id === versionId,
    );
    if (!v) throw new AppError("Image not found.", 404);
    if (process.env.E2E_TEST_MODE === "1") {
      if (process.env.NODE_ENV === "production")
        throw new AppError("Test mode is unavailable.", 503);
      return [];
    }
    const key = `${auth.memoryId}:${versionId}`;
    const pending = discovered.get(key);
    if (pending) return pending;
    const job = this.findRegions(auth, versionId, v.imagePath).catch((e) => {
      discovered.delete(key);
      throw e;
    });
    discovered.set(key, job);
    return job;
  }
  private async findRegions(
    auth: AuthorAuth,
    versionId: string,
    imagePath: string,
  ) {
    const image = await this.store.readImage(imagePath);
    let concepts: string[] = [];
    try {
      concepts = await this.concepts(image);
    } catch {
      return [];
    }
    const regions: VisibleRegion[] = [];
    for (const concept of concepts) {
      const requestId = randomUUID();
      try {
        await this.store.reserveDetailOutline(
          auth.memoryId,
          versionId,
          requestId,
        );
      } catch {
        break;
      }
      let success = false;
      try {
        regions.push(...(await this.conceptSegment(image, concept)));
        success = true;
      } catch {
        // One missed concept still leaves the others clickable.
      } finally {
        await this.store
          .finishDetailOutline(auth.memoryId, versionId, requestId, success)
          .catch(() => {});
      }
    }
    const seen = new Set<string>();
    return regions.filter((region) => {
      if (seen.has(region.path)) return false;
      seen.add(region.path);
      return true;
    });
  }
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
