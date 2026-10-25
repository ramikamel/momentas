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
                Share this published version. Later edits stay private.
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
                Add my perspective
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
                View both perspectives
              </a>
            </div>
          ) : p.role === "original" ? (
            <p className="conn-small perspective-waiting">
              Waiting for their perspective.
            </p>
          ) : null}
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
