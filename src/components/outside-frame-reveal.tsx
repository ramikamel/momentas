"use client";
import { useRef, useState } from "react";
import type { ImageVersionView } from "@/lib/memory/types";
import "./outside-frame.css";
export function OutsideFrameReveal({
  memoryId,
  source,
  versions,
  onGenerated,
  onShareWider,
  initialVersionId,
}: {
  initialVersionId?: string;
  memoryId: string;
  source: ImageVersionView;
  versions: ImageVersionView[];
  onGenerated: (v: ImageVersionView) => void;
  onShareWider?: (v: ImageVersionView) => void;
}) {
  const [text, setText] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [latestGenerated, setLatestGenerated] = useState(""),
    [revealed, setRevealed] = useState(
      !!initialVersionId &&
        versions.some(
          (v) => v.id === initialVersionId && !!v.scene.outsideFrame,
        ),
    );
  const attempt = useRef<{ text: string; id: string } | null>(null),
    lock = useRef(false);
  const wider =
    versions.find((v) => v.id === latestGenerated) ??
    versions.find(
      (v) =>
        v.id === initialVersionId &&
        v.scene.outsideFrame?.sourceVersionId === source.id,
    ) ??
    versions
      .filter((v) => v.scene.outsideFrame?.sourceVersionId === source.id)
      .at(-1);
  async function generate() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    if (attempt.current?.text !== text)
      attempt.current = { text, id: crypto.randomUUID() };
    try {
      const r = await fetch(`/api/memories/${memoryId}/source/expand`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: attempt.current!.id,
          sourceVersionId: source.id,
          outsideFrameText: text,
        }),
      });
      const data = await r.json();
      if (!r.ok) {
        if (data.code === "GENERATION_FAILED") attempt.current = null;
        throw Error(
          data.error ||
            "The wider scene could not be created. Your original is safe.",
        );
      }
      onGenerated(data);
      setLatestGenerated(data.id);
      setRevealed(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="outside-frame" aria-label="Outside the frame">
      <div className="outside-heading">
        <span className="eyebrow">THE CAMERA ONLY SAW SO MUCH</span>
        <h2>What was outside the frame?</h2>
        <p>
          A place for the things you remember beyond the edges. Keep your
          photograph, and imagine a wider view beside it.
        </p>
      </div>
      <label htmlFor="outside-recollection">
        Tell us what you remember beyond this photograph.
      </label>
      <textarea
        id="outside-recollection"
        rows={3}
        maxLength={1200}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Just to the left, our picnic table had lemonade and my red backpack…"
        disabled={busy}
      />
      <div className="outside-actions">
        <button
          className="button primary"
          disabled={busy || text.trim().length < 8}
          onClick={() => void generate()}
        >
          {busy ? "Remembering the surroundings…" : "Imagine beyond the frame"}
        </button>
        {wider && (
          <button
            className="button subtle"
            onClick={() => setRevealed(!revealed)}
            aria-expanded={revealed}
          >
            {revealed ? "Return to the original" : "Reveal the wider memory"}
          </button>
        )}
      </div>
      <p className="outside-caption">
        An AI interpretation of your recollection. Your original photograph
        remains unchanged.
      </p>
      {busy && (
        <p role="status">
          Your photograph is ready to explore above while the wider scene is
          created. This may take a few minutes.
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      {wider && revealed && (
        <div className="outside-reveal">
          <figure>
            <img src={source.imageUrl} alt="Original photograph, unchanged" />
            <figcaption>THE ORIGINAL PHOTOGRAPH</figcaption>
          </figure>
          <figure>
            <img
              src={wider.imageUrl}
              alt="AI reconstruction from your recollection"
            />
            <figcaption>AI RECONSTRUCTION FROM YOUR RECOLLECTION</figcaption>
          </figure>
          <blockquote>{wider.scene.outsideFrame?.recollection}</blockquote>
          {onShareWider && (
            <button
              className="button secondary"
              onClick={() => onShareWider(wider)}
            >
              Share the photograph & wider memory
            </button>
          )}
        </div>
      )}
    </section>
  );
}
