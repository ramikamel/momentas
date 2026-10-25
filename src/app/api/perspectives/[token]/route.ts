import { PerspectiveService } from "@/lib/server/perspectives";
import { getStore } from "@/lib/server/store";
import { handle, jsonResponse } from "@/lib/server/http";
export const runtime = "nodejs";
export const maxDuration = 180;
export async function GET(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  return handle(async () => {
    const p = await context.params;
    return jsonResponse(
      await new PerspectiveService(getStore()).getInvite(p.token),
    );
  });
}
