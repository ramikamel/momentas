import { PinService } from "@/lib/server/pins";
import { assertSameOrigin, authorTokenFrom } from "@/lib/server/access";
import { getStore } from "@/lib/server/store";
import { handle, jsonResponse, jsonBody } from "@/lib/server/http";
export const runtime = "nodejs";
export const maxDuration = 180;
export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string; versionId: string }> },
) {
  return handle(async () => {
    assertSameOrigin(request);
    const p = await context.params;
    const data = (await jsonBody(request)) as { pins: unknown };
    return jsonResponse(
      await new PinService(getStore()).save(
        { memoryId: p.id, ownerToken: authorTokenFrom(request, p.id) },
        p.versionId,
        data.pins,
      ),
    );
  });
}
