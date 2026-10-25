import { z } from "zod";
const text = (max: number) => z.string().trim().min(1).max(max);
const sourcedDetail = z.object({ text: text(1000), sourceQuote: text(6000) });
export const scenePlanSchema = z.object({
  setting: sourcedDetail.nullable(),
  people: z.array(sourcedDetail).max(12),
  details: z.array(sourcedDetail).max(20),
  perspective: sourcedDetail.nullable(),
  feelings: z.array(sourcedDetail).max(8),
  followUpQuestions: z.array(text(300)).max(2),
});
export const draftSchema = z.object({
  title: text(120),
  authorName: text(80),
  recipientName: text(80),
  story: text(6000),
  scenePlan: scenePlanSchema.nullable().default(null),
});
export const approvedSceneSchema = z.object({
  plan: scenePlanSchema,
  authorAdditions: z.string().trim().max(6000),
  confirmed: z.literal(true),
});
export const renderSchema = z
  .object({
    requestId: z.uuid(),
    scene: approvedSceneSchema,
    baseVersionId: z.uuid().nullable(),
    instruction: text(1000).nullable(),
  })
  .refine(
    (v) => v.baseVersionId === null || v.instruction !== null,
    "Describe the change you want to make.",
  );
export const publishSchema = z.object({
  versionId: z.uuid(),
  caption: text(2000),
});
export const messageSchema = z.object({
  versionId: z.uuid(),
  displayName: text(80),
  text: text(2000),
});
export const replySchema = z.object({ parentId: z.uuid(), text: text(2000) });
