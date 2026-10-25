import { assertSameOrigin, authorTokenFrom } from "@/lib/server/access";
import { requireAuthor } from "@/lib/server/authorization";
import { handle, jsonBody, jsonResponse } from "@/lib/server/http";
import { SourcePhotoService } from "@/lib/server/source-photo";
import { getStore } from "@/lib/server/store";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function POST(request: Request, context: Context) {
  return handle(async () => {
    assertSameOrigin(request);
    const { id } = await context.params;
    const store = getStore(),
      auth = { memoryId: id, ownerToken: authorTokenFrom(request, id) };
    await requireAuthor(store, auth);
    const service = new SourcePhotoService(store);
    const input = (await jsonBody(request)) as {
      name: string;
      mimeType: string;
      size: number;
    };
    return jsonResponse(await service.initiate(auth, input), 201);
  });
}
