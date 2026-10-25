import { NextResponse } from "next/server";
import { PerspectiveService } from "@/lib/server/perspectives";
import { getStore } from "@/lib/server/store";
import { assertSameOrigin, cookieName } from "@/lib/server/access";
import { handle, jsonBody, privateHeaders } from "@/lib/server/http";
export const runtime = "nodejs";
export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  return handle(async () => {
    assertSameOrigin(request);
    const { token } = await context.params;
    const input = (await jsonBody(request)) as { authorName: string };
    const result = await new PerspectiveService(getStore()).claim(
      token,
      input.authorName,
    );
    const response = NextResponse.json(
      { memoryId: result.memoryId },
      { headers: privateHeaders },
    );
    response.cookies.set(cookieName(result.memoryId), result.contributorToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return response;
  });
}
