import { assertSameOrigin, authorTokenFrom } from "@/lib/server/access";
import { handle, privateHeaders } from "@/lib/server/http";
import { ReferenceService } from "@/lib/server/references";
import { getStore } from "@/lib/server/store";
export const runtime = "nodejs";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; refId: string }> },
) {
  return handle(async () => {
    const { id, refId } = await context.params;
    const image = await new ReferenceService(getStore()).read(
      { memoryId: id, ownerToken: authorTokenFrom(request, id) },
      refId,
    );
    return new Response(new Uint8Array(image.bytes), {
      headers: {
        ...privateHeaders,
        "Content-Type": image.mimeType,
        "X-Content-Type-Options": "nosniff",
      },
    });
  });
}
export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string; refId: string }> },
) {
  return handle(async () => {
    assertSameOrigin(request);
    const { id, refId } = await context.params;
    await new ReferenceService(getStore()).remove(
      { memoryId: id, ownerToken: authorTokenFrom(request, id) },
      refId,
    );
    return new Response(null, { status: 204, headers: privateHeaders });
  });
}
