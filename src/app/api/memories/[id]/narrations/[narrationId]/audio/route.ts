import { authorTokenFrom } from "@/lib/server/access";
import { handle, privateHeaders } from "@/lib/server/http";
import { getStore } from "@/lib/server/store";
import { VoiceService } from "@/lib/server/voice-service";
export const runtime = "nodejs";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; narrationId: string }> },
) {
  return handle(async () => {
    const { id, narrationId } = await context.params,
      url = new URL(request.url);
    const bytes = await new VoiceService(getStore()).getAudio(
      id,
      narrationId,
      authorTokenFrom(request, id),
      url.searchParams.get("share") || undefined,
      url.searchParams.get("comparison") || undefined,
    );
    return new Response(new Uint8Array(bytes), {
      headers: {
        ...privateHeaders,
        "Content-Type": "audio/wav",
        "Content-Length": String(bytes.length),
        "X-Content-Type-Options": "nosniff",
      },
    });
  });
}
