import { PerspectiveService } from "@/lib/server/perspectives";
import { assertSameOrigin, authorTokenFrom } from "@/lib/server/access";
import { getStore } from "@/lib/server/store";
import { handle, jsonResponse, jsonBody } from "@/lib/server/http";
export const runtime = "nodejs";
export const maxDuration = 180;
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    assertSameOrigin(request);
    const p = await context.params;
    const data = (await jsonBody(request)) as { eventLabel: string };
    return jsonResponse(
      await new PerspectiveService(getStore()).createInvite(
        { memoryId: p.id, ownerToken: authorTokenFrom(request, p.id) },
        data.eventLabel,
      ),
    );
  });
}
