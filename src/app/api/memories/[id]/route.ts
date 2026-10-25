import { getMemoryService } from "@/lib/server/memories";
import { assertSameOrigin, authorTokenFrom } from "@/lib/server/access";
import { draftSchema } from "@/lib/memory/schema";
import { handle, jsonBody, jsonResponse } from "@/lib/server/http";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  return handle(async () => {
    const { id } = await context.params;
    return jsonResponse(
      await getMemoryService().getAuthorMemory(
        id,
        authorTokenFrom(request, id),
      ),
    );
  });
}
export async function PATCH(request: Request, context: Context) {
  return handle(async () => {
    assertSameOrigin(request);
    const { id } = await context.params;
    const service = getMemoryService(),
      token = authorTokenFrom(request, id);
    await service.saveDraft(
      id,
      token,
      draftSchema.parse(await jsonBody(request)),
    );
    return jsonResponse(await service.getAuthorMemory(id, token));
  });
}
