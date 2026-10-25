import { assertSameOrigin, authorTokenFrom } from "@/lib/server/access";
import { handle, jsonResponse } from "@/lib/server/http";
import { ReferenceService } from "@/lib/server/references";
import { getStore } from "@/lib/server/store";
export const runtime = "nodejs";
export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string; referenceId: string }> },
) {
  return handle(async () => {
    assertSameOrigin(request);
    const { id, referenceId } = await context.params;
    await new ReferenceService(getStore()).remove(
      { memoryId: id, ownerToken: authorTokenFrom(request, id) },
      referenceId,
    );
    return jsonResponse({ removed: true });
  });
}
