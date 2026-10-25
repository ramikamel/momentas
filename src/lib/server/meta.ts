import type {
  ApprovedScene,
  GeneratedImage,
  ScenePlan,
} from "@/lib/memory/types";
import type { ReferenceKind } from "@/lib/memory/references";
import { scenePlanSchema } from "@/lib/memory/schema";
import {
  buildImagePrompt,
  extractionInstruction,
  validateSceneEvidence,
} from "@/lib/memory/prompts";
import { z } from "zod";
import { AppError } from "./access";

export type ImageReference = {
  name: string;
  kind: ReferenceKind;
  image: GeneratedImage;
};
export type AiProvider = {
  configured?: boolean;
  extractScene(story: string): Promise<ScenePlan>;
  generateImage(
    scene: ApprovedScene,
    references?: ImageReference[],
  ): Promise<GeneratedImage>;
  editImage(
    image: GeneratedImage,
    scene: ApprovedScene,
    instruction: string,
    references?: ImageReference[],
  ): Promise<GeneratedImage>;
};
async function metaRequest(
  path: string,
  body: unknown,
): Promise<Record<string, unknown>> {
  if (!process.env.MODEL_API_KEY)
    throw new AppError(
      "Image creation is not connected yet. Your memory is saved.",
      503,
      "META_NOT_CONFIGURED",
    );
  const base = (process.env.META_BASE_URL || "https://api.meta.ai/v1").replace(
    /\/$/,
    "",
  );
  let response: Response;
  try {
    response = await fetch(`${base}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.MODEL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(240000),
    });
  } catch {
    throw new AppError(
      "The image service took too long or could not connect. Your previous version is safe. Please try again.",
      502,
      "PROVIDER_UNAVAILABLE",
    );
  }
  if (!response.ok) {
    // Provider response bodies may contain private inputs; never echo them to the browser/logs.
    throw new AppError(
      response.status === 429
        ? "The image service is busy. Please wait and try again."
        : "The AI service could not finish this request. Your memory is saved.",
      response.status === 429 ? 429 : 502,
      "PROVIDER_ERROR",
    );
  }
  try {
    return await response.json();
  } catch {
    throw new AppError(
      "The AI service returned an unreadable result. Your memory is saved.",
      502,
      "PROVIDER_FORMAT",
    );
  }
}
export function validateGeneratedImage(image: GeneratedImage): void {
  const b = Buffer.from(image.bytes);
  const valid =
    (image.mimeType === "image/png" &&
      b
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ||
    (image.mimeType === "image/jpeg" &&
      b[0] === 255 &&
      b[1] === 216 &&
      b[2] === 255) ||
    (image.mimeType === "image/webp" &&
      b.subarray(0, 4).toString() === "RIFF" &&
      b.subarray(8, 12).toString() === "WEBP");
  if (!valid || b.length > 20 * 1024 * 1024)
    throw new AppError(
      "The image service returned an unsupported image. Your previous version is safe.",
      502,
      "INVALID_IMAGE",
    );
}
function imageDataUrl(image: GeneratedImage) {
  return `data:${image.mimeType};base64,${Buffer.from(image.bytes).toString("base64")}`;
}
function readImageResult(value: Record<string, unknown>): GeneratedImage {
  const data = value.data as { b64_json?: string }[] | undefined;
  const b64 = data?.[0]?.b64_json;
  if (!b64 || !/^[A-Za-z0-9+/\s]*={0,2}$/.test(b64))
    throw new AppError(
      "The image service did not return an image. Please try again.",
      502,
      "INVALID_IMAGE",
    );
  const bytes = Buffer.from(b64, "base64");
  const mimeType =
    bytes[0] === 137
      ? "image/png"
      : bytes[0] === 255
        ? "image/jpeg"
        : "image/webp";
  const image = { bytes, mimeType };
  validateGeneratedImage(image);
  return image;
}
export function getAiProvider(): AiProvider {
  if (process.env.E2E_TEST_MODE === "1") {
    if (process.env.NODE_ENV === "production")
      throw new AppError(
        "Test provider is prohibited in production.",
        503,
        "TEST_MODE_FORBIDDEN",
      );
    // Deterministic fixture for isolated automated tests only, never the default user experience.
    const testImage = {
      bytes: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=",
        "base64",
      ),
      mimeType: "image/png",
    };
    return {
      configured: true,
      extractScene: async (story) => ({
        setting: { text: story, sourceQuote: story },
        people: [],
        details: [],
        perspective: null,
        feelings: [],
        followUpQuestions: [],
      }),
      generateImage: async () => testImage,
      editImage: async (_image, _scene, instruction) => {
        if (instruction.includes("[test-fail]"))
          throw new AppError(
            "Test image failure. Your previous version is safe.",
            502,
          );
        return testImage;
      },
    };
  }
  return {
    configured: !!process.env.MODEL_API_KEY,
    async extractScene(story) {
      const result = await metaRequest("/chat/completions", {
        model: process.env.META_TEXT_MODEL || "muse-spark-1.3",
        messages: [
          { role: "system", content: extractionInstruction },
          { role: "user", content: story },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "MemoryScene",
            strict: true,
            schema: z.toJSONSchema(scenePlanSchema, { target: "draft-7" }),
          },
        },
      });
      try {
        const content = (
          result.choices as { message: { content: string } }[]
        )?.[0]?.message.content;
        const plan = scenePlanSchema.parse(JSON.parse(content));
        validateSceneEvidence(story, plan);
        return plan;
      } catch {
        throw new AppError(
          "We could not reliably organize these details. Your memory is saved; please try again or review it manually.",
          502,
          "SCENE_INVALID",
        );
      }
    },
    async generateImage(scene, references = []) {
      const named = references.map(({ name, kind }) => ({ name, kind }));
      if (!references.length)
        return readImageResult(
          await metaRequest("/images/generations", {
            model: process.env.META_IMAGE_MODEL || "muse-image-1.0",
            prompt: buildImagePrompt(scene),
            n: 1,
            size: "1536x1024",
            response_format: "b64_json",
            output_format: "webp",
            reasoning_strength: "low",
            tool_enablement: {
              enable_image_search: false,
              enable_web_search: false,
              enable_shell: false,
            },
          }),
        );
      return readImageResult(
        await metaRequest("/images/edits", {
          model: process.env.META_IMAGE_MODEL || "muse-image-1.0",
          images: references.map((reference) => ({
            image_url: imageDataUrl(reference.image),
          })),
          prompt: buildImagePrompt(scene, undefined, named),
          n: 1,
          response_format: "b64_json",
          output_format: "webp",
          reasoning_strength: "low",
          tool_enablement: {
            enable_image_search: false,
            enable_web_search: false,
            enable_shell: false,
          },
        }),
      );
    },
    async editImage(image, scene, instruction, references = []) {
      return readImageResult(
        await metaRequest("/images/edits", {
          model: process.env.META_IMAGE_MODEL || "muse-image-1.0",
          images: [image, ...references.map((reference) => reference.image)].map(
            (item) => ({ image_url: imageDataUrl(item) }),
          ),
          prompt: buildImagePrompt(
            scene,
            instruction,
            references.map(({ name, kind }) => ({ name, kind })),
          ),
          n: 1,
          response_format: "b64_json",
          output_format: "webp",
          reasoning_strength: "low",
          tool_enablement: {
            enable_image_search: false,
            enable_web_search: false,
            enable_shell: false,
          },
        }),
      );
    },
  };
}
