import { ZodError } from "zod";
import { AppError } from "./access";

export const privateHeaders = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
};
export async function jsonBody(request: Request): Promise<unknown> {
  const limit = 256 * 1024,
    reader = request.body?.getReader();
  if (!reader) throw new AppError("Please provide the memory details.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) {
      await reader.cancel();
      throw new AppError(
        "These memory details are too long.",
        413,
        "TOO_LARGE",
      );
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new AppError(
      "Please provide valid memory details.",
      400,
      "INVALID_JSON",
    );
  }
}
export function jsonResponse(value: unknown, status = 200) {
  return Response.json(value, { status, headers: privateHeaders });
}
export async function handle(
  action: () => Promise<Response>,
): Promise<Response> {
  try {
    return await action();
  } catch (error) {
    if (error instanceof ZodError)
      return jsonResponse(
        {
          error:
            "Please check the required fields and their length, then try again.",
          code: "VALIDATION_ERROR",
        },
        400,
      );
    if (error instanceof AppError)
      return jsonResponse(
        { error: error.message, code: error.code },
        error.status,
      );
    const status = (error as { status?: number })?.status;
    const messages: Record<number, string> = {
      403: "This action is not available from this link.",
      404: "This memory or image was not found.",
      409: "This memory changed or a request is already in progress. Refresh and try again; your written input is preserved.",
      429: "The service is busy. Please try again in a moment. Your saved work is safe.",
    };
    if (status && messages[status])
      return jsonResponse(
        { error: messages[status], code: "STORE_CONFLICT" },
        status,
      );
    // Log only the error category, never provider responses, credentials, or memory text.
    console.error(
      "Memory request failed:",
      error instanceof Error ? error.name : "UnknownError",
    );
    return jsonResponse(
      {
        error:
          "We could not finish this request. Your saved memory is safe. Please try again.",
        code: "SERVER_ERROR",
      },
      500,
    );
  }
}
