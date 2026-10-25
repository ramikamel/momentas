import { z } from "zod";
import { getMemoryService } from "@/lib/server/memories";
import { assertSameOrigin, authorTokenFrom } from "@/lib/server/access";
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
    const { requestId } = z
      .object({ requestId: z.uuid() })
      .parse(await jsonBody(request));
    return jsonResponse(
      await getMemoryService().generateFromStory(
        id,
        authorTokenFrom(request, id),
        requestId,
      ),
    );
  });
}
