import { NextResponse } from "next/server";
import { getMemoryService } from "@/lib/server/memories";
import { assertSameOrigin, cookieName } from "@/lib/server/access";
import { draftSchema } from "@/lib/memory/schema";
import { handle, jsonBody, privateHeaders } from "@/lib/server/http";
export const runtime = "nodejs";
export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const { id, authorToken } = await getMemoryService().createMemory(
      draftSchema.parse(await jsonBody(request)),
    );
    const response = NextResponse.json(
      { id },
      { status: 201, headers: privateHeaders },
    );
    response.cookies.set(cookieName(id), authorToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return response;
  });
}
