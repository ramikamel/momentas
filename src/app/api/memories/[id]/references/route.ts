import { assertSameOrigin, authorTokenFrom, AppError } from "@/lib/server/access";
import { handle, jsonResponse } from "@/lib/server/http";
import { ReferenceService } from "@/lib/server/references";
import { getStore } from "@/lib/server/store";
export const runtime = "nodejs";
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    assertSameOrigin(request);
    const { id } = await context.params;
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw new AppError("Provide a picture, a name, and whether it is a person or a place.");
    }
    const file = form.get("image");
    if (!(file instanceof File))
      throw new AppError("Provide a picture of the person or place.");
    return jsonResponse(
      await new ReferenceService(getStore()).add(
        { memoryId: id, ownerToken: authorTokenFrom(request, id) },
        {
          name: String(form.get("name") ?? ""),
          kind: String(form.get("kind") ?? ""),
          bytes: new Uint8Array(await file.arrayBuffer()),
        },
      ),
      201,
    );
  });
}
