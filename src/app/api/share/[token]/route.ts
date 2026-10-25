import { getMemoryService } from "@/lib/server/memories";
import { handle, jsonResponse } from "@/lib/server/http";
export const runtime = "nodejs";
export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  return handle(async () => {
    const { token } = await context.params;
    return jsonResponse(await getMemoryService().getSharedMemory(token));
  });
}
