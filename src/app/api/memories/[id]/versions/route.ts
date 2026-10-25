import { getMemoryService } from "@/lib/server/memories";
import { assertSameOrigin, authorTokenFrom } from "@/lib/server/access";
import { renderSchema } from "@/lib/memory/schema";
import { handle, jsonBody, jsonResponse } from "@/lib/server/http";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    assertSameOrigin(request);
    const { id } = await context.params;
    return jsonResponse(
      await getMemoryService().renderVersion(
        id,
        authorTokenFrom(request, id),
        renderSchema.parse(await jsonBody(request)),
      ),
    );
  });
}
