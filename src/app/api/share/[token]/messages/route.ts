import { getMemoryService } from "@/lib/server/memories";
import { assertSameOrigin } from "@/lib/server/access";
import { messageSchema } from "@/lib/memory/schema";
import { handle, jsonBody, jsonResponse } from "@/lib/server/http";
export const runtime = "nodejs";
export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  return handle(async () => {
    assertSameOrigin(request);
    const { token } = await context.params;
    return jsonResponse(
      await getMemoryService().postRecipientMessage(
        token,
        messageSchema.parse(await jsonBody(request)),
      ),
    );
  });
}
