import { expect, it, vi } from "vitest";
import { savedMemories } from "@/lib/server/library";
import { hashToken } from "@/lib/server/access";
import type { Store } from "@/lib/memory/types";
const id = "84fd9444-a1cc-4001-84be-19cdc355ad07",
  token = "ownerToken_123456789012345678901234567890";
it("lists all versions only for valid owner cookies and returns no secrets", async () => {
  const versions = vi.fn(async () => [
    { id: "version1", createdAt: "2026-10-24", imagePath: "private-key-path" },
  ]);
  const getMemory = vi.fn(async () => ({
    id,
    title: "Ride",
    authorName: "Alex",
    recipientName: "Dad",
    createdAt: "2026-10-24",
    authorTokenHash: hashToken(token),
    story: "PRIVATE STORY",
  }));
  const store = { getMemory, versions } as unknown as Store;
  expect(await savedMemories(store, "")).toEqual({
    memories: [],
    unavailable: 0,
  });
  expect(getMemory).not.toHaveBeenCalled();
  expect(
    (
      await savedMemories(
        store,
        `memory_owner_${id}=wrongToken_12345678901234567890`,
      )
    ).memories,
  ).toHaveLength(0);
  expect(versions).not.toHaveBeenCalled();
  const result = await savedMemories(
    store,
    `unrelated=x; memory_owner_${id}=${token}`,
  );
  expect(result.memories[0].versions[0].imageUrl).toBe(
    `/api/memories/${id}/images/version1`,
  );
  expect(JSON.stringify(result)).not.toMatch(
    /PRIVATE STORY|private-key-path|authorTokenHash|ownerToken_/,
  );
});
it("reports temporary storage failures instead of silently showing an empty library", async () => {
  const store = {
    getMemory: vi.fn(async () => {
      throw Error("database");
    }),
  } as unknown as Store;
  expect(await savedMemories(store, `memory_owner_${id}=${token}`)).toEqual({
    memories: [],
    unavailable: 1,
  });
});
