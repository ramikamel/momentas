import { handle, jsonResponse } from "@/lib/server/http";
import { getStore } from "@/lib/server/store";
import { savedMemories } from "@/lib/server/library";
export const runtime = "nodejs";
export async function GET(request: Request) {
  return handle(async () =>
    jsonResponse(
      await savedMemories(getStore(), request.headers.get("cookie") || ""),
    ),
  );
}
