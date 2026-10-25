import { PerspectiveService } from "@/lib/server/perspectives";
import { assertSameOrigin } from "@/lib/server/access";
import { getStore } from "@/lib/server/store";
import { handle, jsonResponse, jsonBody } from "@/lib/server/http";
export const runtime = "nodejs";
export const maxDuration = 180;
export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  return handle(async () => {
    assertSameOrigin(request);
    const p = await context.params;
    return jsonResponse(
      await new PerspectiveService(getStore()).postComparisonMessage(
        p.token,
        await jsonBody(request),
      ),
    );
  });
}
