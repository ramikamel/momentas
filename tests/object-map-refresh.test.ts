import { afterEach, expect, it, vi } from "vitest";
import { createConnectionSupabaseStore } from "@/lib/server/connection-supabase-store";
afterEach(() => vi.unstubAllGlobals());
it("refresh only invalidates completed maps and leaves pending leases to the atomic claim", async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return init?.method === "PATCH"
        ? new Response(null, { status: 204 })
        : Response.json({
            claimed: false,
            map: { status: "pending", objects: [] },
          });
    }),
  );
  const store = createConnectionSupabaseStore(
    "https://database.example",
    "test-key",
  );
  expect(await store.claimObjectMap("m", "v", "job", true)).toMatchObject({
    claimed: false,
    map: { status: "pending" },
  });
  expect(calls[0].init?.method).toBe("PATCH");
  expect(calls[0].url).toContain(
    "memory_id=eq.m&version_id=eq.v&status=eq.complete",
  );
  expect(JSON.parse(String(calls[0].init?.body))).toEqual({ status: "failed" });
  expect(calls[1].url).toContain("/rpc/claim_memory_object_map");
  expect(JSON.parse(String(calls[1].init?.body))).toMatchObject({
    p_retry: true,
    p_request_id: "job",
  });
});
