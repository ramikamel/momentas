import { expect, it } from "vitest";
import { normalizePins } from "@/lib/memory/pins";
import type { ApprovedScene } from "@/lib/memory/types";
const scene: ApprovedScene = {
  confirmed: true,
  authorAdditions: "",
  plan: {
    setting: null,
    people: [],
    details: [],
    feelings: [],
    perspective: null,
    followUpQuestions: [],
  },
};
const note = {
  id: "84fd9444-a1cc-4001-84be-19cdc355ad07",
  x: 0.2,
  y: 0.7,
  detailPath: "note",
  label: "forged label",
  sourceQuote: "  That was the bicycle we fixed together.  ",
  origin: "author" as const,
  outline: { path: "M100,100L200,100L200,200Z" },
};
it("allows a new author note without an extracted scene choice and derives its label", () => {
  const [p] = normalizePins(scene, [note]);
  expect(p.sourceQuote).toBe("That was the bicycle we fixed together.");
  expect(p.label).toBe("That was the bicycle we fixed together.");
  expect(p.origin).toBe("author");
  expect(p.outline).toEqual(note.outline);
});
it("rejects blank notes, invalid geometry, out-of-bounds or oversized paths", () => {
  for (const change of [
    { sourceQuote: "  " },
    { sourceQuote: "x".repeat(501) },
    { x: Infinity },
    { outline: { path: "M0,0L1001,0L0,1Z" } },
    { outline: { path: "<script>alert(1)</script>" } },
    { outline: { path: "M0,0L1,1Z" } },
    { outline: { path: "M0,0" + "L1,1".repeat(4000) + "Z" } },
  ])
    expect(() => normalizePins(scene, [{ ...note, ...change }])).toThrow();
});
it("does not let a free-note origin bypass source validation for a legacy detail", () => {
  expect(() =>
    normalizePins(scene, [{ ...note, detailPath: "setting" }]),
  ).toThrow();
});
