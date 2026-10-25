import { jsonResponse } from "@/lib/server/http";
export const runtime = "nodejs";
export async function GET() {
  return jsonResponse({
    metaConfigured: !!process.env.MODEL_API_KEY,
    storage:
      process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
        ? "supabase"
        : "local",
    demoMode:
      process.env.E2E_TEST_MODE === "1" &&
      process.env.NODE_ENV !== "production",
  });
}
