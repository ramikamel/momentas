import { z } from "zod";
import { assertSameOrigin, authorTokenFrom } from "@/lib/server/access";
import { handle, jsonBody, jsonResponse } from "@/lib/server/http";
import { getStore } from "@/lib/server/store";
import { ObjectMapService } from "@/lib/server/object-map";
export const runtime = "nodejs";
export const maxDuration = 180;
type Context = {
  params: Promise<{
    id: string;
    versionId: string;
  }>;
};
export async function GET(request: Request, context: Context) {
  return handle(async () => {
    const { id, versionId } = await context.params;
    return jsonResponse({
      map: await new ObjectMapService(getStore()).get(
        { memoryId: id, ownerToken: authorTokenFrom(request, id) },
        versionId,
      ),
    });
  });
}
export async function POST(request: Request, context: Context) {
  return handle(async () => {
    assertSameOrigin(request);
    const { id, versionId } = await context.params;
    const body = z
      .object({
        retry: z.boolean().optional(),
        concept: z.string().min(1).max(60).optional(),
      })
      .parse(await jsonBody(request));
    const service = new ObjectMapService(getStore()),
      auth = { memoryId: id, ownerToken: authorTokenFrom(request, id) };
    return jsonResponse(
      body.concept
        ? { objects: await service.search(auth, versionId, body.concept) }
        : { map: await service.prepare(auth, versionId, body.retry) },
    );
  });
}
