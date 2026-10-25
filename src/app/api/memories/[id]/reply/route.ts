import { getMemoryService } from "@/lib/server/memories";
import { assertSameOrigin, authorTokenFrom } from "@/lib/server/access";
import { replySchema } from "@/lib/memory/schema";
import { handle, jsonBody, jsonResponse } from "@/lib/server/http";
export const runtime = "nodejs";
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    assertSameOrigin(request);
    const { id } = await context.params;
    const input = replySchema.parse(await jsonBody(request));
    return jsonResponse(
      await getMemoryService().postStorytellerReply(
        id,
        authorTokenFrom(request, id),
        input.parentId,
        input.text,
      ),
    );
  });
}
