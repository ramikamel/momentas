import { describe, expect, it } from "vitest";
import { draftSchema } from "@/lib/memory/schema";
describe("voice-first drafts", () => {
  it("allows a private empty story so recording can start without invented words", () => {
    expect(
      draftSchema.safeParse({
        title: "Our ride",
        authorName: "Alex",
        recipientName: "Dad",
        story: "",
        scenePlan: null,
      }).success,
    ).toBe(true);
  });
});
