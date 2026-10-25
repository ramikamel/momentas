"use client";
import { useState } from "react";
import type { AuthorMemoryView } from "@/lib/memory/types";
import "./connections.css";
export function PerspectiveControls({
  memory,
  onRefresh,
}: {
  memory: AuthorMemoryView;
  onRefresh: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [copied, setCopied] = useState(false);
  const p = memory.perspective;
  async function act(path: string, body: object) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(`/api/memories/${memory.id}/perspective${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Please try again.");
      await onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }
  if (!memory.currentPublicationId) return null;
  return (
    <section className="conn-perspective-controls">
      {!p ? (
        <>
          <button
            type="button"
            className="conn-button"
            disabled={busy || !memory.currentPublicationId}
            onClick={() => act("", { eventLabel: "A shared memory" })}
          >
            Invite another perspective
          </button>
        </>
      ) : (
        <>
          {p.role === "original" && p.inviteUrl && (
            <>
              <div className="conn-copy">
                {typeof window !== "undefined"
                  ? new URL(p.inviteUrl, window.location.origin).href
                  : p.inviteUrl}
              </div>
              <button
                className="conn-button secondary"
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(
                      new URL(p.inviteUrl!, window.location.origin).href,
                    );
                    setCopied(true);
                  } catch {
                    setError("Copy the invitation link above.");
                  }
                }}
              >
                {copied ? "Invitation copied" : "Copy perspective invitation"}
              </button>
            </>
          )}
          {p.role === "contributor" && !p.attached && (
            <>
              <p className="conn-control-caption">
                Your current published image, caption, selected quotes and
                optional recorded voice will join the comparison. This
                comparison keeps this approved version when you later edit your
                memory.
              </p>
              <button
                type="button"
                className="conn-button"
                disabled={busy || !memory.currentPublicationId}
                onClick={() =>
                  act("/attach", {
                    linkId: p.id,
                    publicationId: memory.currentPublicationId,
                  })
                }
              >
                Add this version to our comparison
              </button>
            </>
          )}
          {p.attached ? (
            <div className="conn-actions">
              <a
                href={p.comparisonUrl}
                target="_blank"
                rel="noreferrer"
                className="conn-button"
              >
                Open our comparison →
              </a>
              {p.synthesisStatus !== "complete" && (
                <button
                  type="button"
                  className="conn-button secondary"
                  disabled={busy || p.synthesisStatus === "pending"}
                  onClick={() =>
                    act("/synthesis", {
                      linkId: p.id,
                      requestId: crypto.randomUUID(),
                    })
                  }
                >
                  {busy || p.synthesisStatus === "pending"
                    ? "Finding the connections…"
                    : p.synthesisStatus === "failed"
                      ? "Retry comparison insights"
                      : "Create comparison insights"}
                </button>
              )}
            </div>
          ) : (
            <p className="conn-small">
              The reveal opens when the other perspective is reviewed and
              shared.
            </p>
          )}
          <p className="conn-small">
            Comparisons keep the versions both people chose to share. Later
            drafts stay separate.
          </p>
        </>
      )}
      {error && (
        <p role="alert" className="conn-error">
          {error}
        </p>
      )}
    </section>
  );
}
