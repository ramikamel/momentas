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

it("removes the old demo cap using the existing RPC while retaining atomic reservations", async () => {
  const fetcher = vi.fn(async () => Response.json({ kind: "reserved" }));
  vi.stubGlobal("fetch", fetcher);
  await createSupabaseStore(
    "https://example.supabase.co",
    "test-key",
  ).reserveRender("memory", "request", null);
  const [url, options] = fetcher.mock.calls[0] as unknown as [
    string,
    RequestInit,
  ];
  expect(url).toContain("/rpc/reserve_render");
  expect(JSON.parse(String(options.body)).p_cap).toBe(2147483647);
});
