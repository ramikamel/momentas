import { getMemoryService } from "@/lib/server/memories";
import { assertSameOrigin, authorTokenFrom } from "@/lib/server/access";
import { publishSchema } from "@/lib/memory/schema";
import { handle, jsonBody, jsonResponse } from "@/lib/server/http";
export const runtime = "nodejs";
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    assertSameOrigin(request);
    const { id } = await context.params;
    const input = publishSchema.parse(await jsonBody(request));
    return jsonResponse(
      await getMemoryService().publishMemory(
        id,
        authorTokenFrom(request, id),
        input.versionId,
        input.caption,
        input.includeNarration,
      ),
    );
  });
}
