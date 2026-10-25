import { afterEach, describe, expect, it, vi } from "vitest";
import { createSupabaseStore } from "@/lib/server/supabase-store";
afterEach(() => vi.unstubAllGlobals());
describe("Supabase configuration", () => {
  it("accepts a REST endpoint URL without appending rest/v1 twice", async () => {
    const fetcher = vi.fn(async (url: string) => {
      void url;
      return new Response("[]", { status: 200 });
    });
    vi.stubGlobal("fetch", fetcher);
    await createSupabaseStore(
      "https://example.supabase.co/rest/v1/",
      "sb_secret_example",
    ).getMemory("memory");
    expect(fetcher.mock.calls[0][0]).toBe(
      "https://example.supabase.co/rest/v1/memories?id=eq.memory",
    );
  });
});
