import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
    public code = "REQUEST_ERROR",
  ) {
    super(message);
  }
}
export function createToken(): string {
  return randomBytes(32).toString("base64url");
}
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
export function matchesToken(token: string, expected: string): boolean {
  if (!token || !/^[a-f0-9]{64}$/.test(expected)) return false;
  return timingSafeEqual(
    Buffer.from(hashToken(token), "hex"),
    Buffer.from(expected, "hex"),
  );
}
// Immutable v1 derivation domain: preserve published links across project renames.
const SHARE_DOMAIN_V1 = Buffer.from(
  "7468726f7567682d6d792d657965733a73686172653a",
  "hex",
);
export function shareTokenFor(authorToken: string, memoryId: string): string {
  return createHmac("sha256", authorToken)
    .update(SHARE_DOMAIN_V1)
    .update(memoryId)
    .digest("base64url");
}
export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  const expected = process.env.APP_ORIGIN || new URL(request.url).origin;
  if (
    !origin ||
    origin !== new URL(expected).origin ||
    request.headers.get("sec-fetch-site") === "cross-site"
  ) {
    throw new AppError(
      "This action must come from the memory app.",
      403,
      "ORIGIN_DENIED",
    );
  }
}
export function cookieName(id: string): string {
  if (!/^[0-9a-f-]{36}$/i.test(id))
    throw new AppError("Memory not found.", 404, "NOT_FOUND");
  return `memory_owner_${id}`;
}
export function authorTokenFrom(request: Request, id: string): string {
  const name = cookieName(id);
  return (
    (request.headers.get("cookie") || "")
      .split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith(`${name}=`))
      ?.slice(name.length + 1) || ""
  );
}

export function perspectiveInviteToken(
  ownerToken: string,
  linkId: string,
): string {
  return createHmac("sha256", ownerToken)
    .update(`momentas:invite:v1:${linkId}`)
    .digest("base64url");
}
export function perspectiveContributorToken(
  inviteToken: string,
  linkId: string,
): string {
  return createHmac("sha256", inviteToken)
    .update(`momentas:contributor:v1:${linkId}`)
    .digest("base64url");
}
export function perspectiveComparisonToken(
  contributorToken: string,
  linkId: string,
): string {
  return createHmac("sha256", contributorToken)
    .update(`momentas:comparison:v1:${linkId}`)
    .digest("base64url");
}
