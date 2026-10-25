import { assertSameOrigin, authorTokenFrom } from "@/lib/server/access";
import { handle, jsonResponse } from "@/lib/server/http";
import { getStore } from "@/lib/server/store";
import { SegmentationService } from "@/lib/server/segmentation";
export const runtime = "nodejs";
export const maxDuration = 120;
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; versionId: string }> },
) {
  return handle(async () => {
    assertSameOrigin(request);
    const { id, versionId } = await context.params;
    return jsonResponse({
      regions: await new SegmentationService(getStore()).discover(
        { memoryId: id, ownerToken: authorTokenFrom(request, id) },
        versionId,
      ),
    });
  });
}
