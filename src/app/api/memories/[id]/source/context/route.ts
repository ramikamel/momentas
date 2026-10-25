import {
  assertSameOrigin,
  authorTokenFrom,
  AppError,
} from "@/lib/server/access";
import { handle, jsonBody, jsonResponse } from "@/lib/server/http";
import { getStore } from "@/lib/server/store";
import { PhotoContextService } from "@/lib/server/photo-context";
export const runtime = "nodejs";
type C = { params: Promise<{ id: string }> };
export function GET(r: Request, c: C) {
  return handle(async () => {
    const { id } = await c.params;
    const vid = new URL(r.url).searchParams.get("versionId");
    if (!vid) throw new AppError("Choose your photograph.");
    return jsonResponse(
      await new PhotoContextService(getStore()).list(
        { memoryId: id, ownerToken: authorTokenFrom(r, id) },
        vid,
      ),
    );
  });
}
export function PUT(r: Request, c: C) {
  return handle(async () => {
    assertSameOrigin(r);
    const { id } = await c.params;
    const body = (await jsonBody(r)) as { versionId: string; draft: unknown };
    return jsonResponse(
      await new PhotoContextService(getStore()).save(
        { memoryId: id, ownerToken: authorTokenFrom(r, id) },
        body.versionId,
        body.draft,
      ),
    );
  });
}
