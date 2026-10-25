import {
  AppError,
  assertSameOrigin,
  authorTokenFrom,
} from "@/lib/server/access";
import { requireAuthor } from "@/lib/server/authorization";
import { handle, jsonResponse } from "@/lib/server/http";
import { SourcePhotoService, SOURCE_LIMIT } from "@/lib/server/source-photo";
import { getStore } from "@/lib/server/store";
export const runtime = "nodejs";
export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string; uploadId: string }> },
) {
  return handle(async () => {
    assertSameOrigin(request);
    const { id, uploadId } = await context.params;
    const store = getStore(),
      auth = { memoryId: id, ownerToken: authorTokenFrom(request, id) };
    await requireAuthor(store, auth);
    if (process.env.NODE_ENV === "production")
      throw new AppError("Use the signed upload URL.", 403);
    const reader = request.body?.getReader();
    if (!reader) throw new AppError("Choose a photograph.");
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.length;
        if (total > SOURCE_LIMIT) {
          await reader.cancel();
          throw new AppError("Photographs must be at most 12 MiB.", 413);
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    await new SourcePhotoService(store).upload(
      auth,
      uploadId,
      Buffer.concat(chunks),
    );
    return jsonResponse({ uploaded: true });
  });
}
