import { getMemoryService } from "@/lib/server/memories";
import { assertSameOrigin, authorTokenFrom } from "@/lib/server/access";
import { handle, jsonBody, jsonResponse } from "@/lib/server/http";
import { z } from "zod";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    assertSameOrigin(request);
    const { id } = await context.params;
    const input = z
      .object({ story: z.string().trim().min(1).max(6000) })
      .parse(await jsonBody(request));
    return jsonResponse(
      await getMemoryService().extractScene(
        id,
        authorTokenFrom(request, id),
        input.story,
      ),
    );
  });
}
