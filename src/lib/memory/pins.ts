import { z } from "zod";
import type { ApprovedScene, SourcedDetail } from "./types";
import type { PinDraft } from "./connections";
export const pinDraftSchema = z.object({
  id: z.uuid(),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  detailPath: z.string().max(40),
  label: z.string().max(1000),
  sourceQuote: z.string().min(1).max(500),
});
export function resolveSceneDetail(
  scene: ApprovedScene,
  path: string,
): SourcedDetail {
  if (path === "setting" && scene.plan.setting) return scene.plan.setting;
  if (path === "perspective" && scene.plan.perspective)
    return scene.plan.perspective;
  const match = /^(people|details|feelings)\.(\d+)$/.exec(path);
  if (match) {
    const value =
      scene.plan[match[1] as "people" | "details" | "feelings"][
        Number(match[2])
      ];
    if (value) return value;
  }
  throw new Error("Choose a detail from this saved scene.");
}
export function normalizePins(scene: ApprovedScene, raw: unknown): PinDraft[] {
  const pins = z.array(pinDraftSchema).max(5).parse(raw);
  if (new Set(pins.map((p) => p.id)).size !== pins.length)
    throw new Error("Each pin must have a unique ID.");
  return pins.map((p) => {
    const detail = resolveSceneDetail(scene, p.detailPath);
    if (!detail.sourceQuote.includes(p.sourceQuote))
      throw new Error("Use an exact excerpt from the reviewed quote.");
    return { ...p, label: detail.text };
  });
}
