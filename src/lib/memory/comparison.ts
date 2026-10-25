import { z } from "zod";
import type {
  ComparisonSource,
  ComparisonSynthesis,
  PublicationSnapshot,
} from "./connections";
const text = z.string().trim().min(1).max(1000),
  side = z.enum(["left", "right"]);
const evidence = z.object({ side, quote: z.string().min(1).max(2000) });
export const comparisonSynthesisSchema = z.object({
  shared: z
    .array(z.object({ text, evidence: z.array(evidence).min(2).max(4) }))
    .max(2),
  distinct: z
    .array(z.object({ side, text, evidence: z.array(evidence).min(1).max(2) }))
    .max(2),
  questions: z.array(text).max(2),
});
export function buildComparisonSources(
  left: PublicationSnapshot,
  right: PublicationSnapshot,
): [ComparisonSource, ComparisonSource] {
  return [left, right].map((p) => ({
    publicationId: p.id,
    authorName: p.authorName,
    caption: p.caption,
    pins: p.pins.map(({ id, x, y, label, sourceQuote }) => ({
      id,
      x,
      y,
      label,
      sourceQuote,
    })),
  })) as [ComparisonSource, ComparisonSource];
}
export function validateComparisonEvidence(
  sources: [ComparisonSource, ComparisonSource],
  raw: ComparisonSynthesis,
): void {
  const value = comparisonSynthesisSchema.parse(raw);
  const valid = (e: { side: "left" | "right"; quote: string }) => {
    const s = sources[e.side === "left" ? 0 : 1];
    return [s.caption, ...s.pins.map((p) => p.sourceQuote)].some((text) =>
      text.includes(e.quote),
    );
  };
  for (const f of value.shared) {
    if (
      !f.evidence.some((e) => e.side === "left") ||
      !f.evidence.some((e) => e.side === "right") ||
      !f.evidence.every(valid)
    )
      throw new Error("Shared observations need a quote from both accounts.");
  }
  for (const f of value.distinct) {
    if (!f.evidence.every((e) => e.side === f.side && valid(e)))
      throw new Error("Evidence does not match the named account.");
  }
}
