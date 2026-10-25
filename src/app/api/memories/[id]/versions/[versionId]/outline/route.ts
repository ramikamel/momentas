import { z } from "zod";
import { assertSameOrigin, authorTokenFrom } from "@/lib/server/access";
import { handle, jsonBody, jsonResponse } from "@/lib/server/http";
import { getStore } from "@/lib/server/store";
import { SegmentationService } from "@/lib/server/segmentation";
export const runtime = "nodejs";
export const maxDuration = 60;
const point = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
});
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; versionId: string }> },
) {
  return handle(async () => {
    assertSameOrigin(request);
    const { id, versionId } = await context.params;
    const { x, y } = point.parse(await jsonBody(request));
    return jsonResponse({
      outline: await new SegmentationService(getStore()).select(
        { memoryId: id, ownerToken: authorTokenFrom(request, id) },
        versionId,
        x,
        y,
      ),
    });
  });
}
