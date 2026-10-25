import { authorTokenFrom } from "@/lib/server/access";
import { handle, privateHeaders } from "@/lib/server/http";
import { SourcePhotoService } from "@/lib/server/source-photo";
import { getStore } from "@/lib/server/store";
export const runtime = "nodejs";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const { id } = await context.params;
    const image = await new SourcePhotoService(getStore()).getDisplay({
      memoryId: id,
      ownerToken: authorTokenFrom(request, id),
    });
    return new Response(Buffer.from(image.bytes), {
      headers: { ...privateHeaders, "Content-Type": image.mimeType },
    });
  });
}
