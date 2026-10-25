import type { SavedMemory, Store } from "@/lib/memory/types";
import { matchesToken } from "./access";
export async function savedMemories(
  store: Store,
  cookieHeader: string,
): Promise<{ memories: SavedMemory[]; unavailable: number }> {
  const owners = new Map<string, string>();
  for (const cookie of cookieHeader.split(";")) {
    const m = /^memory_owner_([0-9a-f-]{36})=([A-Za-z0-9_-]{16,128})$/i.exec(
      cookie.trim(),
    );
    if (m && !owners.has(m[1])) owners.set(m[1], m[2]);
  }
  const queue = [...owners];
  const memories: SavedMemory[] = [];
  let unavailable = 0;
  await Promise.all(
    Array.from({ length: Math.min(5, queue.length) }, async () => {
      while (queue.length) {
        const [id, token] = queue.shift()!;
        try {
          const m = await store.getMemory(id);
          if (!m || !matchesToken(token, m.authorTokenHash)) continue;
          const versions = await store.versions(id);
          memories.push({
            id,
            title: m.title,
            authorName: m.authorName,
            recipientName: m.recipientName,
            createdAt: m.createdAt,
            versions: versions.map((v) => ({
              id: v.id,
              createdAt: v.createdAt,
              imageUrl: `/api/memories/${id}/images/${v.id}`,
            })),
          });
        } catch {
          unavailable++;
        }
      }
    }),
  );
  memories.sort((a, b) =>
    (b.versions.at(-1)?.createdAt || b.createdAt).localeCompare(
      a.versions.at(-1)?.createdAt || a.createdAt,
    ),
  );
  return { memories, unavailable };
}
