import { describe, expect, it } from "vitest";
import {
  scenePlanSchema,
  draftSchema,
  approvedSceneSchema,
} from "@/lib/memory/schema";
import { buildImagePrompt, validateSceneEvidence } from "@/lib/memory/prompts";
const story = "Dad taught me to ride a bike in a big parking lot.";
const plan = {
  setting: { text: "A big parking lot", sourceQuote: "a big parking lot" },
  people: [{ text: "Dad", sourceQuote: "Dad" }],
  details: [],
  perspective: null,
  feelings: [],
  followUpQuestions: [],
};
describe("grounded scene review", () => {
  it("accepts sparse memories with no invented feelings", () => {
    expect(scenePlanSchema.parse(plan).feelings).toEqual([]);
    expect(() => validateSceneEvidence(story, plan)).not.toThrow();
  });
  it("rejects source quotes that were never supplied", () => {
    expect(() =>
      validateSceneEvidence(story, {
        ...plan,
        feelings: [{ text: "terrified", sourceQuote: "I was terrified" }],
      }),
    ).toThrow(/source/i);
  });
  it("rejects malformed plans, overlong inputs and more than two optional questions", () => {
    expect(
      scenePlanSchema.safeParse({
        ...plan,
        followUpQuestions: ["one", "two", "three"],
      }).success,
    ).toBe(false);
    expect(scenePlanSchema.safeParse({}).success).toBe(false);
    expect(
      draftSchema.safeParse({
        title: " ",
        authorName: "Sam",
        recipientName: "Dad",
        story,
        scenePlan: null,
      }).success,
    ).toBe(true);
    expect(
      draftSchema.safeParse({
        title: "Bike",
        authorName: "Sam",
        recipientName: "Dad",
        story: "x".repeat(6001),
        scenePlan: null,
      }).success,
    ).toBe(false);
  });
  it("requires explicit confirmation, carries prior details and an author correction", () => {
    expect(
      approvedSceneSchema.safeParse({
        plan,
        authorAdditions: "",
        confirmed: false,
      }).success,
    ).toBe(false);
    const prompt = buildImagePrompt(
      { plan, authorAdditions: "The bike was red.", confirmed: true },
      "Put Dad farther behind me.",
    );
    expect(prompt).toContain("A big parking lot");
    expect(prompt).toContain("The bike was red.");
    expect(prompt).toContain("Put Dad farther behind me.");
    expect(prompt).toMatch(/preserve/i);
    expect(prompt).toMatch(/single moment/i);
    expect(prompt).toMatch(/each person only once/i);
  });
});
