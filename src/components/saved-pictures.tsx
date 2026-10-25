"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { SavedMemory } from "@/lib/memory/types";
import { Header } from "./memory-app";
export function SavedPictures() {
  const [data, setData] = useState<{
      memories: SavedMemory[];
      unavailable: number;
    } | null>(null),
    [error, setError] = useState("");
  const load = useCallback(async () => {
    setError("");
    try {
      const r = await fetch("/api/library", { cache: "no-store" });
      if (!r.ok)
        throw new Error("Could not load your pictures. Please try again.");
      setData(await r.json());
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <>
      <Header />
      <main className="saved-shell">
        <div className="eyebrow">YOUR MEMORY BOOK</div>
        <h1>Saved pictures.</h1>
        <p className="saved-intro">
          Every version, in one place. Open a picture to keep shaping it or
          share it with someone.
        </p>
        <p className="form-note">
          Your editing access is saved in this browser on this site. If a memory
          is missing, use the browser and site address where you created it.
        </p>
        <Link className="button primary" href="/#begin">
          Create a memory →
        </Link>
        {error && (
          <div className="error" role="alert">
            {error}
            <button className="button subtle" onClick={() => void load()}>
              Try again
            </button>
          </div>
        )}
        {!data && !error && <p role="status">Finding your saved pictures…</p>}
        {data?.unavailable ? (
          <p role="alert">
            Some memories couldn’t load.{" "}
            <button className="conn-link" onClick={() => void load()}>
              Try again
            </button>
          </p>
        ) : null}
        {data && !data.memories.length && (
          <section className="saved-empty">
            <h2>Your first memory starts here.</h2>
            <p>
              Submit a memory to generate an image. Each image is saved
              automatically and will appear here.
            </p>
          </section>
        )}
        {data?.memories.map((m) => (
          <section className="saved-memory" key={m.id}>
            <div className="saved-memory-heading">
              <div>
                <h2>
                  <Link href={`/memory/${m.id}`}>{m.title}</Link>
                </h2>
                <p>
                  {m.authorName} → {m.recipientName} · {m.versions.length} saved{" "}
                  {m.versions.length === 1 ? "image" : "images"}
                </p>
              </div>
              <Link className="quiet-link" href={`/memory/${m.id}`}>
                {m.versions.length ? "Open memory" : "Continue draft"} →
              </Link>
            </div>
            {m.versions.length ? (
              <div className="saved-grid">
                {m.versions.map((v, i) => (
                  <Link
                    className="saved-picture"
                    key={v.id}
                    href={`/memory/${m.id}?image=${v.id}`}
                  >
                    <img
                      src={v.imageUrl}
                      alt={`${v.origin === "source" ? "Original photograph" : "AI reconstruction"} of ${m.title}, saved image ${i + 1}`}
                      loading="lazy"
                    />
                    <span>
                      {v.origin === "source"
                        ? "Original photograph"
                        : `Image ${i + 1}`}
                      <span>Open picture ↗</span>
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="saved-draft-note">
                Your words are saved. Open this draft to generate its first
                image.
              </p>
            )}
          </section>
        ))}
      </main>
    </>
  );
}
