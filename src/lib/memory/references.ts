import { z } from "zod";

export const referenceKindSchema = z.enum(["person", "place"]);
export const referenceNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .regex(
    /^[\p{L}][\p{L}\p{N} '\-]*$/u,
    "Use a short name such as Dad or our kitchen.",
  );

export type ReferenceKind = z.infer<typeof referenceKindSchema>;
export type VisualReference = {
  id: string;
  memoryId: string;
  name: string;
  kind: ReferenceKind;
  imagePath: string;
  createdAt: string;
};
export type VisualReferenceView = {
  id: string;
  name: string;
  kind: ReferenceKind;
  imageUrl: string;
};
