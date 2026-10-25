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
  const saved =
    versions.find(
      (v) =>
        v.id === initialVersionId &&
        v.scene.outsideFrame?.sourceVersionId === source.id,
    ) ??
    versions
      .filter((v) => v.scene.outsideFrame?.sourceVersionId === source.id)
      .at(-1);
  const resultCaption = useRef<HTMLElement>(null),
    recollection = useRef<HTMLTextAreaElement>(null);
  function reveal() {
    setRevealed(true);
    requestAnimationFrame(() => resultCaption.current?.focus());
  }
  function edit() {
    setRevealed(false);
    requestAnimationFrame(() => recollection.current?.focus());
  }
  const [text, setText] = useState(
      () => saved?.scene.outsideFrame?.recollection ?? "",
    ),
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
  const wider = versions.find((v) => v.id === latestGenerated) ?? saved;
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
      reveal();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <section
      className={`outside-frame ${revealed && wider ? "has-reveal" : ""}`}
      aria-label="Outside the frame"
    >
      <p className="sr-only" role="status">
        {wider && revealed
          ? "Your wider memory is ready. The original and AI reconstruction are shown side by side."
          : ""}
      </p>
      <div className="outside-compose">
        <figure className="outside-original">
          <img src={source.imageUrl} alt="Original photograph, unchanged" />
          <figcaption>
            YOUR ORIGINAL PHOTOGRAPH <span>Always unchanged</span>
          </figcaption>
        </figure>
        {wider && revealed ? (
          <figure className="outside-generated">
            <img
              src={wider.imageUrl}
              alt="AI reconstruction from your recollection"
            />
            <figcaption ref={resultCaption} tabIndex={-1}>
              AI RECONSTRUCTION FROM YOUR RECOLLECTION
            </figcaption>
          </figure>
        ) : (
          <div className="outside-prompt">
            <span className="eyebrow">WHAT THE CAMERA MISSED</span>
            <h2>
              What was just
              <br />
              outside the frame?
            </h2>
            <p>
              Maybe the people beside you, the rest of the room, or something
              happening nearby. Only you remember.
            </p>
            <label htmlFor="outside-recollection">
              Tell us what you remember beyond this photograph.
            </label>
            <textarea
              ref={recollection}
              id="outside-recollection"
              rows={5}
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
                {busy
                  ? "Remembering the surroundings…"
                  : "Imagine beyond the frame"}
              </button>
              {wider && (
                <button className="button subtle" onClick={reveal}>
                  Reveal the wider memory
                </button>
              )}
            </div>
            <p className="outside-caption">
              An AI interpretation of your recollection. Your original
              photograph remains unchanged.
            </p>
            {busy && (
              <p role="status">
                Creating your wider memory. This may take a few minutes.
              </p>
            )}
            {error && <p role="alert">{error}</p>}
          </div>
        )}
      </div>
      {wider && revealed && (
        <div className="outside-after">
          <div className="outside-account">
            <span className="eyebrow">BEYOND THE PHOTOGRAPH</span>
            <blockquote>{wider.scene.outsideFrame?.recollection}</blockquote>
          </div>
          <div className="outside-actions">
            <button className="button subtle" onClick={edit}>
              Edit remembered surroundings
            </button>
            {onShareWider && (
              <button
                className="button primary"
                onClick={() => onShareWider(wider)}
              >
                Share the photograph & wider memory
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
