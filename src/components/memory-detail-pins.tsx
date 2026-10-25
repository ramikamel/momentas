"use client";
import { useState } from "react";
import type { ImageVersionView, SourcedDetail } from "@/lib/memory/types";
import type { PinDraft, PublicPin } from "@/lib/memory/connections";
import "./connections.css";

export function MemoryDetailPins({
  imageUrl,
  alt,
  pins,
  onAsk,
}: {
  imageUrl: string;
  alt: string;
  pins: PublicPin[];
  onAsk?: (pin: PublicPin) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <div className="conn-pins">
      <div className="conn-image">
        <img src={imageUrl} alt={alt} />
        {pins.map((pin, i) => (
          <button
            key={pin.id}
            type="button"
            className="conn-pin"
            style={{ left: `${pin.x * 100}%`, top: `${pin.y * 100}%` }}
            aria-label={`Explore detail ${i + 1}: ${pin.label}`}
            aria-pressed={selected === pin.id}
            onClick={() => setSelected(pin.id)}
          >
            {i + 1}
          </button>
        ))}
      </div>
      {pins.length > 0 && (
        <ol className="conn-detail-list">
          {pins.map((pin, i) => (
            <li key={pin.id}>
              <button
                type="button"
                className="conn-detail-toggle"
                aria-expanded={selected === pin.id}
                onClick={() => setSelected(selected === pin.id ? null : pin.id)}
              >
                {i + 1}. {pin.label}
              </button>
              {selected === pin.id && (
                <div className="conn-quote">
                  <blockquote>{pin.sourceQuote}</blockquote>
                  {onAsk && (
                    <button
                      type="button"
                      className="conn-link"
                      onClick={() => onAsk(pin)}
                    >
                      Ask about this detail →
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function DetailPinEditor({
  memoryId,
  version,
  initialPins,
  onSaved,
}: {
  memoryId: string;
  version: ImageVersionView;
  initialPins: PinDraft[];
  onSaved?: (pins: PinDraft[]) => void;
}) {
  const plan = version.scene.plan;
  const choices: { path: string; detail: SourcedDetail }[] = [];
  if (plan.setting) choices.push({ path: "setting", detail: plan.setting });
  for (const key of ["people", "details", "feelings"] as const)
    plan[key].forEach((detail, i) =>
      choices.push({ path: `${key}.${i}`, detail }),
    );
  if (plan.perspective)
    choices.push({ path: "perspective", detail: plan.perspective });
  const [pins, setPins] = useState(initialPins);
  const [path, setPath] = useState(choices[0]?.path || "");
  const detail = choices.find((c) => c.path === path)?.detail;
  const [quote, setQuote] = useState("");
  const [x, setX] = useState(0.5),
    [y, setY] = useState(0.5);
  const [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const valid =
    !!detail &&
    quote.length > 0 &&
    quote.length <= 500 &&
    detail.sourceQuote.includes(quote);
  async function save() {
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch(
        `/api/memories/${memoryId}/versions/${version.id}/pins`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pins }),
        },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Could not save details.");
      onSaved?.(pins);
      setNotice("Details saved. Publish this version to share them.");
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Could not save details.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="conn-editor">
      <h3>Leave a detail to discover</h3>
      <p className="conn-muted">
        Choose up to five details from your reviewed account. New image versions
        start with no pins.
      </p>
      <div
        className="conn-image conn-placement"
        onClick={(event) => {
          const box = event.currentTarget.getBoundingClientRect();
          setX(
            Math.max(0, Math.min(1, (event.clientX - box.left) / box.width)),
          );
          setY(
            Math.max(0, Math.min(1, (event.clientY - box.top) / box.height)),
          );
        }}
      >
        <img
          src={version.imageUrl}
          alt="Select a position for your memory detail"
        />
        <span
          className="conn-pin conn-target"
          style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
          aria-hidden="true"
        >
          +
        </span>
      </div>
      <label className="conn-field">
        Reviewed detail
        <select
          value={path}
          onChange={(event) => {
            setPath(event.target.value);
            setQuote("");
          }}
        >
          {choices.map((choice) => (
            <option key={choice.path} value={choice.path}>
              {choice.detail.text}
            </option>
          ))}
        </select>
      </label>
      {detail && (
        <>
          <p className="conn-muted">Select words from this source quote:</p>
          <blockquote className="conn-source">{detail.sourceQuote}</blockquote>
        </>
      )}
      <label className="conn-field">
        Exact excerpt to share
        <textarea
          value={quote}
          maxLength={500}
          onChange={(event) => setQuote(event.target.value)}
          placeholder="Copy a meaningful excerpt from the quote above"
        />
      </label>
      {quote && !valid && (
        <p className="conn-error">
          Use 1–500 consecutive characters from this detail’s source quote.
        </p>
      )}
      <div className="conn-position">
        <label>
          Horizontal position: {Math.round(x * 100)}%
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={x}
            onChange={(event) => setX(Number(event.target.value))}
          />
        </label>
        <label>
          Vertical position: {Math.round(y * 100)}%
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={y}
            onChange={(event) => setY(Number(event.target.value))}
          />
        </label>
      </div>
      <button
        type="button"
        className="conn-button"
        disabled={!valid || pins.length >= 5 || busy}
        onClick={() => {
          if (detail && valid) {
            setPins([
              ...pins,
              {
                id: crypto.randomUUID(),
                x,
                y,
                detailPath: path,
                label: detail.text,
                sourceQuote: quote,
              },
            ]);
            setQuote("");
            setNotice("Detail added. Save your details when ready.");
          }
        }}
      >
        Add detail ({pins.length}/5)
      </button>
      <ol className="conn-detail-list">
        {pins.map((pin) => (
          <li key={pin.id}>
            <strong>{pin.label}</strong>
            <blockquote>{pin.sourceQuote}</blockquote>
            <button
              type="button"
              className="conn-link"
              disabled={busy}
              onClick={() => setPins(pins.filter((p) => p.id !== pin.id))}
            >
              Remove detail
            </button>
          </li>
        ))}
      </ol>
      <button
        type="button"
        className="conn-button"
        disabled={busy}
        onClick={save}
      >
        {busy ? "Saving…" : "Save details"}
      </button>
      <p role="status">{notice}</p>
    </section>
  );
}
