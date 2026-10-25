import {
  assertSameOrigin,
  authorTokenFrom,
  AppError,
} from "@/lib/server/access";
import { handle, jsonResponse } from "@/lib/server/http";
import { getStore } from "@/lib/server/store";
import { VoiceService } from "@/lib/server/voice-service";
export const runtime = "nodejs";
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    assertSameOrigin(request);
    const { id } = await context.params;
    const reader = request.body?.getReader();
    if (!reader) throw new AppError("Provide a recording.");
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 3 * 1024 * 1024) {
          await reader.cancel();
          throw new AppError("Recording upload is too large.", 413);
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const body = Buffer.concat(chunks),
      type = request.headers.get("content-type") || "";
    let wav: Uint8Array = body;
    if (type.startsWith("multipart/form-data")) {
      let form: FormData;
      try {
        form = await new Response(body, {
          headers: { "content-type": type },
        }).formData();
      } catch {
        throw new AppError("Provide a valid recording upload.");
      }
      const file = form.get("audio");
      if (!(file instanceof File))
        throw new AppError("Provide the audio file.");
      if (file.size > 2880044)
        throw new AppError("Recording is too large.", 413);
      wav = new Uint8Array(await file.arrayBuffer());
    }
    return jsonResponse(
      await new VoiceService(getStore()).upload(
        { memoryId: id, ownerToken: authorTokenFrom(request, id) },
        wav,
      ),
    );
  });
}
