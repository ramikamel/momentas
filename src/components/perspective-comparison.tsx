"use client";
import { useEffect, useState, useCallback } from "react";
import type { ComparisonView, PublicPin } from "@/lib/memory/connections";
import { MemoryDetailPins } from "./memory-detail-pins";
import { MemoryVoicePlayer } from "./memory-voice-player";
import "./connections.css";
export function PerspectiveComparison({ token }: { token: string }) {
  const [view, setView] = useState<ComparisonView | null>(null),
    [error, setError] = useState(""),
    [revealed, setRevealed] = useState(false),
    [active, setActive] = useState<"left" | "right">("left"),
    [pin, setPin] = useState<PublicPin | null>(null),
    [side, setSide] = useState<"left" | "right">("left"),
    [name, setName] = useState(""),
    [text, setText] = useState(""),
    [busy, setBusy] = useState(false);
  const endpoint = `/api/comparisons/${encodeURIComponent(token)}`;
  const load = useCallback(async () => {
    const r = await fetch(endpoint, { cache: "no-store" }),
      data = await r.json();
    if (!r.ok) throw new Error(data.error || "This comparison is not ready.");
    setView(data);
    setError("");
  }, [endpoint]);
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [load]);
  function select(which: "left" | "right") {
    document.querySelectorAll("audio").forEach((a) => a.pause());
    setActive(which);
    setSide(which);
    setPin(null);
  }
  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!view) return;
    setBusy(true);
    setError("");
    try {
      const r = await fetch(endpoint + "/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          side,
          publicationId: view[side].id,
          pinId: pin?.id ?? null,
          displayName: name,
          text,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Could not send your question.");
      setText("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="conn-shell">
      <span className="conn-eyebrow">Same moment, two memories</span>
      <h1>
        There’s more than one
        <br />
        <em>way to remember.</em>
      </h1>
      {error && (
        <p className="conn-error" role="alert">
          {error}
        </p>
      )}
      {!view ? (
        <>
          <p className="conn-muted">
            The comparison opens after both people have shared their
            perspectives.
          </p>
          <button
            className="conn-button"
            onClick={() => load().catch((e) => setError(e.message))}
          >
            Check for the other perspective
          </button>
        </>
      ) : !revealed ? (
        <section className="conn-reveal">
          <span className="conn-eyebrow">
            {view.left.authorName} &amp; {view.right.authorName}
          </span>
          <h2>
            One memory.
            <br />
            Two worlds inside it.
          </h2>
          <p className="conn-muted">
            Each person shaped their own account. Listen to what stayed with
            them.
          </p>
          <button className="conn-button" onClick={() => setRevealed(true)}>
            Reveal our perspectives →
          </button>
        </section>
      ) : (
        <>
          <div
            className="conn-tabs"
            role="tablist"
            aria-label="Whose perspective"
          >
            <button
              className={`conn-button ${active === "left" ? "" : "secondary"}`}
              role="tab"
              aria-selected={active === "left"}
              onClick={() => select("left")}
            >
              {view.left.authorName} remembers
            </button>
            <button
              className={`conn-button ${active === "right" ? "" : "secondary"}`}
              role="tab"
              aria-selected={active === "right"}
              onClick={() => select("right")}
            >
              {view.right.authorName} remembers
            </button>
          </div>
          <div className="conn-pair">
            {(["left", "right"] as const).map((which) => {
              const p = view[which];
              return (
                <article
                  className="conn-side"
                  data-active={active === which}
                  key={p.id}
                >
                  <span className="conn-eyebrow">
                    {p.authorName}’s perspective · AI reconstruction
                  </span>
                  <h2>{p.title}</h2>
                  <MemoryDetailPins
                    imageUrl={p.imageUrl}
                    alt={`AI reconstruction of ${p.authorName}'s memory`}
                    pins={p.pins}
                    onAsk={(detail) => {
                      setSide(which);
                      setPin(detail);
                      document
                        .getElementById("conn-question")
                        ?.scrollIntoView({ behavior: "smooth" });
                    }}
                  />
                  <p>“{p.caption}”</p>
                  {p.narration && <MemoryVoicePlayer narration={p.narration} />}
                </article>
              );
            })}
          </div>
          <section className="conn-insights">
            <span className="conn-eyebrow">
              A starting point, not a verdict
            </span>
            <h2>What your accounts bring together.</h2>
            {view.synthesis ? (
              <>
                {view.synthesis.shared.map((f, i) => (
                  <div className="conn-observation" key={`s${i}`}>
                    <strong>In both accounts</strong>
                    <p>{f.text}</p>
                    {f.evidence.map((e, j) => (
                      <button
                        className="conn-link conn-evidence"
                        key={j}
                        onClick={() => select(e.side)}
                      >
                        {view[e.side].authorName}: “{e.quote}”
                      </button>
                    ))}
                  </div>
                ))}
                {view.synthesis.distinct.map((f, i) => (
                  <div className="conn-observation" key={`d${i}`}>
                    <strong>{view[f.side].authorName} also remembers</strong>
                    <p>{f.text}</p>
                    {f.evidence.map((e, j) => (
                      <blockquote className="conn-evidence" key={j}>
                        “{e.quote}”
                      </blockquote>
                    ))}
                  </div>
                ))}
                {view.synthesis.shared.length +
                  view.synthesis.distinct.length ===
                  0 && (
                  <p>
                    These accounts leave room for a conversation. Ask what
                    mattered most to each other.
                  </p>
                )}
                {view.synthesis.questions.map((q) => (
                  <button
                    key={q}
                    className="conn-link"
                    style={{ display: "block" }}
                    onClick={() => {
                      setText(q);
                      document
                        .getElementById("conn-question")
                        ?.scrollIntoView({ behavior: "smooth" });
                    }}
                  >
                    {q}
                  </button>
                ))}
              </>
            ) : (
              <p className="conn-muted">
                {view.synthesisStatus === "failed"
                  ? "The AI insights could not finish. Both memories are here; either storyteller can retry from their workspace."
                  : view.synthesisStatus === "pending"
                    ? "Finding the connections in your words…"
                    : "Both perspectives are here. Either storyteller can create the AI insights from their workspace."}
              </p>
            )}
          </section>
          <section id="conn-question">
            <h2>What does this bring back?</h2>
            <button
              className="conn-link"
              onClick={() => load().catch((e) => setError(e.message))}
            >
              Refresh conversation
            </button>
            {view.messages
              .filter((m) => !m.parentId)
              .map((m) => (
                <article className="conn-message" key={m.id}>
                  <strong>{m.displayName}</strong>
                  <small>
                    {" "}
                    · about{" "}
                    {m.memoryId === view.left.memoryId
                      ? view.left.authorName
                      : view.right.authorName}
                    ’s perspective{m.pinId ? " · a selected detail" : ""}
                  </small>
                  {m.pinId && (
                    <blockquote className="conn-evidence">
                      “
                      {
                        [...view.left.pins, ...view.right.pins].find(
                          (pin) => pin.id === m.pinId,
                        )?.sourceQuote
                      }
                      ”
                    </blockquote>
                  )}
                  <p>{m.text}</p>
                  {view.messages
                    .filter((reply) => reply.parentId === m.id)
                    .map((reply) => (
                      <div className="conn-reply" key={reply.id}>
                        <strong>{reply.displayName} · Storyteller</strong>
                        <p>{reply.text}</p>
                      </div>
                    ))}
                </article>
              ))}
            <form onSubmit={send}>
              <label className="conn-field">
                Ask about whose perspective?
                <select
                  value={side}
                  onChange={(e) => {
                    setSide(e.target.value as "left" | "right");
                    setPin(null);
                  }}
                >
                  <option value="left">{view.left.authorName}</option>
                  <option value="right">{view.right.authorName}</option>
                </select>
              </label>
              {pin && (
                <div className="conn-quote">
                  <blockquote>{pin.sourceQuote}</blockquote>
                  <button
                    className="conn-link"
                    type="button"
                    onClick={() => setPin(null)}
                  >
                    Ask without this detail
                  </button>
                </div>
              )}
              <label className="conn-field">
                Your name
                <input
                  required
                  maxLength={80}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label className="conn-field">
                Your question or reflection
                <textarea
                  required
                  rows={3}
                  maxLength={2000}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                />
              </label>
              <button
                className="conn-button"
                disabled={busy || !name.trim() || !text.trim()}
              >
                {busy ? "Leaving your message…" : "Leave your message"}
              </button>
              <p className="conn-small">
                The person who lived this memory answers in their own words.
              </p>
            </form>
          </section>
        </>
      )}
    </main>
  );
}
