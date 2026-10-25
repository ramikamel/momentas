import {
  AppError,
  assertSameOrigin,
  authorTokenFrom,
} from "@/lib/server/access";
import { requireAuthor } from "@/lib/server/authorization";
import { handle, jsonResponse } from "@/lib/server/http";
import { ReferenceService, referenceForm } from "@/lib/server/references";
import { getStore } from "@/lib/server/store";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  return handle(async () => {
    const { id } = await context.params;
    return jsonResponse(
      await new ReferenceService(getStore()).list({
        memoryId: id,
        ownerToken: authorTokenFrom(request, id),
      }),
    );
  });
}
export async function POST(request: Request, context: Context) {
  return handle(async () => {
    assertSameOrigin(request);
    const { id } = await context.params;
    const store = getStore(),
      auth = { memoryId: id, ownerToken: authorTokenFrom(request, id) };
    await requireAuthor(store, auth);
    const form = await referenceForm(request),
      file = form.get("photo");
    if (!(file instanceof File))
      throw new AppError("Choose a photo to upload.");
    return jsonResponse(
      await new ReferenceService(store).upload(
        auth,
        file,
        form.get("label"),
        form.get("kind"),
      ),
      201,
    );
  });
}
