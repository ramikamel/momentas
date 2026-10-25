import { getMemoryService } from "@/lib/server/memories";
import { authorTokenFrom } from "@/lib/server/access";
import { handle, privateHeaders } from "@/lib/server/http";
export const runtime = "nodejs";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; versionId: string }> },
) {
  return handle(async () => {
    const { id, versionId } = await context.params;
    const image = await getMemoryService().getImage(
      id,
      versionId,
      authorTokenFrom(request, id),
      new URL(request.url).searchParams.get("share"),
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
