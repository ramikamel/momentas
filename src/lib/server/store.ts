import { resolve } from "node:path";
import type { Store } from "../memory/types";
import { createLocalStore } from "./local-store";
import { createSupabaseStore } from "./supabase-store";
const stores = new Map<string, Store>();
export function getStore(): Store {
  const url = process.env.SUPABASE_URL,
    key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (Boolean(url) !== Boolean(key))
    throw new Error("Both Supabase URL and service role key are required");
  if (url && key) {
    const cacheKey = `supabase:${url}:${key}:${process.env.SUPABASE_STORAGE_BUCKET ?? "memory-images"}`;
    let store = stores.get(cacheKey);
    if (!store) {
      store = createSupabaseStore(
        url,
        key,
        process.env.SUPABASE_STORAGE_BUCKET ?? "memory-images",
      );
      stores.set(cacheKey, store);
    }
    return store;
  }
  if (process.env.NODE_ENV === "production")
    throw new Error("Production requires Supabase storage configuration");
  // Runtime-only development fallback: never trace a dynamic local directory into production output.
  const path = resolve(
    /* turbopackIgnore: true */ process.env.LOCAL_DATA_DIR ?? ".data",
  );
  let store = stores.get(path);
  if (!store) {
    store = createLocalStore(path);
    stores.set(path, store);
  }
  return store;
}
