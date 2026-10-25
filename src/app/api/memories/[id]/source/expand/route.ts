import { assertSameOrigin, authorTokenFrom } from "@/lib/server/access";
import { handle, jsonBody, jsonResponse } from "@/lib/server/http";
import { getStore } from "@/lib/server/store";
import { OutsideFrameService } from "@/lib/server/outside-frame";
export const runtime = "nodejs";
export const maxDuration = 300;
export function POST(r: Request, c: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    assertSameOrigin(r);
    const { id } = await c.params;
    return jsonResponse(
      await new OutsideFrameService(getStore()).expand(
        { memoryId: id, ownerToken: authorTokenFrom(r, id) },
        await jsonBody(r),
      ),
    );
  });
}
