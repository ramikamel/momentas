"use client";
import { useCallback, useEffect, useState } from "react";
import type { ComparisonView } from "@/lib/memory/connections";
import "./connections.css";
import "./perspective-comparison.css";

export function PerspectiveComparison({ token }: { token: string }) {
  const [view, setView] = useState<ComparisonView | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const endpoint = `/api/comparisons/${encodeURIComponent(token)}`;
  const load = useCallback(
    async (signal?: AbortSignal) => {
      setBusy(true);
      try {
        const response = await fetch(endpoint, { cache: "no-store", signal });
        const data = await response.json();
        if (response.status === 409) {
          setView(null);
          setError("");
          return;
        }
        if (!response.ok)
          throw new Error(data.error || "Could not open this comparison.");
        setView(data);
        setError("");
      } catch (e) {
        if (!signal?.aborted)
          setError(
            e instanceof Error ? e.message : "Could not open this comparison.",
          );
      } finally {
        if (!signal?.aborted) setBusy(false);
      }
    },
    [endpoint],
  );
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  return (
    <main className="comparison-page">
      <h1>One memory. Two perspectives.</h1>
      {error && (
        <p className="conn-error" role="alert">
          {error}
        </p>
      )}
      {view ? (
        <div className="comparison-grid" aria-label="Both perspectives">
          {[view.left, view.right].map((perspective) => (
            <figure className="comparison-figure" key={perspective.id}>
              <img
                src={perspective.imageUrl}
                alt={
                  perspective.imageOrigin === "source"
                    ? `Original photograph shared by ${perspective.authorName}`
                    : `AI reconstruction of ${perspective.authorName}'s memory`
                }
              />
              <figcaption>
                <strong>{perspective.authorName}</strong>
                <span>
                  {perspective.imageOrigin === "source"
                    ? "Original photograph"
                    : "AI reconstruction"}
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
      ) : (
        <div className="comparison-waiting">
          <p role="status">
            {busy
              ? "Opening your perspectives…"
              : error
                ? "Check the link or try again."
                : "Waiting for the other perspective."}
          </p>
          <button
            className="conn-button"
            disabled={busy}
            onClick={() => void load()}
          >
            {busy ? "Checking…" : "Check again"}
          </button>
        </div>
      )}
    </main>
  );
}
