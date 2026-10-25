import { expect, it } from "vitest";
import {
  validateComparisonEvidence,
  buildComparisonSources,
  comparisonSynthesisSchema,
} from "@/lib/memory/comparison";
import { normalizePins } from "@/lib/memory/pins";
import type { ComparisonSource } from "@/lib/memory/connections";
const sources: [ComparisonSource, ComparisonSource] = [
  {
    publicationId: "left",
    authorName: "Alex",
    caption: "The lot felt enormous.",
    pins: [],
  },
  {
    publicationId: "right",
    authorName: "Dad",
    caption: "I was running behind the bicycle.",
    pins: [],
  },
];
it("requires correct-side verbatim evidence for both accounts of a shared observation", () => {
  expect(() =>
    validateComparisonEvidence(sources, {
      shared: [
        {
          text: "Both remember the lot.",
          evidence: [{ side: "left", quote: "The lot felt enormous." }],
        },
      ],
      distinct: [],
      questions: [],
    }),
  ).toThrow();
  expect(() =>
    validateComparisonEvidence(sources, {
      shared: [],
      distinct: [
        {
          side: "right",
          text: "The lot",
          evidence: [{ side: "right", quote: "The lot felt enormous." }],
        },
      ],
      questions: [],
    }),
  ).toThrow();
  expect(() =>
    validateComparisonEvidence(sources, {
      shared: [],
      distinct: [
        {
          side: "left",
          text: "Alex remembers the scale.",
          evidence: [{ side: "left", quote: "The lot felt enormous." }],
        },
      ],
      questions: [],
    }),
  ).not.toThrow();
});
it("accepts sparse comparisons without invented overlap and limits observations", () => {
  expect(
    comparisonSynthesisSchema.safeParse({
      shared: [],
      distinct: [],
      questions: [],
    }).success,
  ).toBe(true);
  expect(
    comparisonSynthesisSchema.safeParse({
      shared: [],
      distinct: [],
      questions: ["a", "b", "c"],
    }).success,
  ).toBe(false);
});
it("comparison inputs contain only approved public text", () => {
  const p = {
    id: "p",
    memoryId: "m",
    versionId: "v",
    title: "Memory",
    authorName: "Alex",
    recipientName: "Dad",
    caption: "Public",
    pins: [],
    narrationId: null,
    createdAt: "now",
    story: "PRIVATE",
    audioPath: "PRIVATE",
  };
  expect(
    JSON.stringify(buildComparisonSources(p, { ...p, id: "p2" })),
  ).not.toContain("PRIVATE");
});
it("pin excerpts and labels come from the immutable reviewed version, and bad positions fail", () => {
  const scene = {
    confirmed: true as const,
    authorAdditions: "",
    plan: {
      setting: { text: "The lot", sourceQuote: "The lot felt enormous." },
      people: [],
      details: [],
      feelings: [],
      perspective: null,
      followUpQuestions: [],
    },
  };
  const pin = {
    id: "84fd9444-a1cc-4001-84be-19cdc355ad07",
    x: 0.5,
    y: 0.4,
    detailPath: "setting",
    label: "FORGED",
    sourceQuote: "felt enormous",
  };
  expect(normalizePins(scene, [pin])[0].label).toBe("The lot");
  expect(() =>
    normalizePins(scene, [{ ...pin, sourceQuote: "invented" }]),
  ).toThrow();
  expect(() => normalizePins(scene, [{ ...pin, x: NaN }])).toThrow();
  expect(() =>
    normalizePins(
      scene,
      Array.from({ length: 6 }, () => pin),
    ),
  ).toThrow();
});
