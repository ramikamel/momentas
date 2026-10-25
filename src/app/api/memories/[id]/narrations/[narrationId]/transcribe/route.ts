import {
  assertSameOrigin,
  authorTokenFrom,
  AppError,
} from "@/lib/server/access";
import { handle, jsonBody, jsonResponse } from "@/lib/server/http";
import { getStore } from "@/lib/server/store";
import { VoiceService } from "@/lib/server/voice-service";
export const runtime = "nodejs";
export const maxDuration = 180;
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; narrationId: string }> },
) {
  return handle(async () => {
    assertSameOrigin(request);
    const { id, narrationId } = await context.params;
    const input = (await jsonBody(request)) as { requestId?: unknown };
    if (typeof input?.requestId !== "string")
      throw new AppError("Provide a request ID.");
    return jsonResponse(
      await new VoiceService(getStore()).transcribe(
        { memoryId: id, ownerToken: authorTokenFrom(request, id) },
        narrationId,
        input.requestId,
      ),
    );
  });
}
