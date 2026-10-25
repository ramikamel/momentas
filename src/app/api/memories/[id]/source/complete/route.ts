import {
  AppError,
  assertSameOrigin,
  authorTokenFrom,
} from "@/lib/server/access";
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
    const input = (await jsonBody(request)) as { uploadId: string };
    if (typeof input?.uploadId !== "string")
      throw new AppError("Choose a valid upload.");
    return jsonResponse(await service.complete(auth, input.uploadId));
  });
}
