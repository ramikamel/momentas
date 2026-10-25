"use client";
import { useEffect, useId, useRef, useState } from "react";
import type { ImageVersionView } from "@/lib/memory/types";
import type { PinDraft, PublicPin } from "@/lib/memory/connections";
import { DetailOutline } from "./detail-outline";
import "./connections.css";
type Position = { x: number; y: number };
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
  const [pins, setPins] = useState(initialPins),
    [adding, setAdding] = useState(false),
    [position, setPosition] = useState<Position | null>(null),
    [cursor, setCursor] = useState({ x: 0.5, y: 0.5 }),
    [text, setText] = useState(""),
    [editing, setEditing] = useState<string | null>(null),
    [outline, setOutline] = useState<PublicPin["outline"] | null>(null),
    [finding, setFinding] = useState(false),
    [outlineNotice, setOutlineNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const textarea = useRef<HTMLTextAreaElement>(null),
    addButton = useRef<HTMLButtonElement>(null),
    request = useRef<AbortController | null>(null),
    generation = useRef(0),
    helpId = useId();
  useEffect(
    () => () => {
      generation.current++;
      request.current?.abort();
    },
    [],
  );
  function stopOutline() {
    generation.current++;
    request.current?.abort();
    setFinding(false);
  }
  function cancel() {
    stopOutline();
    setAdding(false);
    setPosition(null);
    setText("");
    setEditing(null);
    setOutline(null);
    setOutlineNotice("");
    requestAnimationFrame(() => addButton.current?.focus());
  }
  async function place(point: Position) {
    stopOutline();
    const current = generation.current,
      controller = new AbortController();
    request.current = controller;
    setPosition(point);
    setCursor(point);
    setOutline(null);
    setFinding(true);
    setOutlineNotice("");
    requestAnimationFrame(() => textarea.current?.focus());
    try {
      const r = await fetch(
        `/api/memories/${memoryId}/versions/${version.id}/outline`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(point),
          signal: controller.signal,
        },
      );
      const data = await r.json();
      if (current !== generation.current) return;
      if (!r.ok) throw new Error(data.error || "Object outline unavailable.");
      setOutline(data.outline);
      setOutlineNotice(
        data.outline
          ? "Object outlined. If it isn’t the right object, use a simple pin or choose another spot."
          : "No object found here. Your detail will use a simple pin.",
      );
    } catch (e) {
      if (current === generation.current)
        setOutlineNotice(
          e instanceof Error && e.name !== "AbortError"
            ? "Couldn’t outline this object. You can still save your note with a pin."
            : "",
        );
    } finally {
      if (current === generation.current) setFinding(false);
    }
  }
  async function persist(next: PinDraft[]): Promise<boolean> {
    setBusy(true);
    setNotice("");
    try {
      const r = await fetch(
        `/api/memories/${memoryId}/versions/${version.id}/pins`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pins: next }),
        },
      );
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Could not save this detail.");
      setPins(data);
      onSaved?.(data);
      return true;
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not save this detail.");
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (!position || !text.trim() || busy) return;
    const pin: PinDraft = {
      id: editing || crypto.randomUUID(),
      ...position,
      detailPath: "note",
      label: text.trim(),
      sourceQuote: text.trim(),
      origin: "author",
      ...(outline ? { outline } : {}),
    };
    if (
      await persist(
        editing
          ? pins.map((p) => (p.id === editing ? pin : p))
          : [...pins, pin],
      )
    ) {
      cancel();
      setNotice("Detail saved. Publish this image to share it.");
    }
  }
  return (
    <section className="conn-natural-editor" aria-label="Image details">
      <div className="conn-detail-toolbar">
        <div>
          <span className="conn-eyebrow">Your memory, in the details</span>
          <p id={helpId} className="conn-muted">
            {adding
              ? "Click a spot in the image, then tell its story."
              : "Some things only you remember. Add a note to a person, object, or place."}
          </p>
        </div>
        {!adding && (
          <button
            ref={addButton}
            type="button"
            className="conn-button"
            disabled={pins.length >= 5 || busy}
            onClick={() => {
              setAdding(true);
              setNotice("");
              setCursor({ x: 0.5, y: 0.5 });
            }}
          >
            ＋ Add a detail
          </button>
        )}
        {adding && (
          <button
            type="button"
            className="conn-button secondary"
            disabled={busy}
            onClick={cancel}
          >
            Cancel
          </button>
        )}
      </div>
      <div
        className={`conn-image conn-detail-image ${adding ? "is-placing" : ""}`}
      >
        <img
          src={version.imageUrl}
          alt="AI reconstruction of your memory"
          draggable={false}
        />
        <DetailOutline outline={outline} />
        {adding && (
          <button
            type="button"
            className="conn-place-hit"
            aria-label="Choose a spot for your detail"
            aria-describedby={helpId}
            disabled={busy}
            onClick={(e) => {
              if (e.detail === 0) {
                void place(cursor);
                return;
              }
              const b = e.currentTarget.getBoundingClientRect();
              void place({
                x: Math.max(0, Math.min(1, (e.clientX - b.left) / b.width)),
                y: Math.max(0, Math.min(1, (e.clientY - b.top) / b.height)),
              });
            }}
            onKeyDown={(e) => {
              const delta: { [key: string]: Position } = {
                ArrowLeft: { x: -0.02, y: 0 },
                ArrowRight: { x: 0.02, y: 0 },
                ArrowUp: { x: 0, y: -0.02 },
                ArrowDown: { x: 0, y: 0.02 },
              };
              const d = delta[e.key];
              if (d) {
                e.preventDefault();
                const next = {
                  x: Math.max(0, Math.min(1, cursor.x + d.x)),
                  y: Math.max(0, Math.min(1, cursor.y + d.y)),
                };
                stopOutline();
                setOutline(null);
                setCursor(next);
                setPosition((p) => (p ? next : null));
                setOutlineNotice(
                  "Press Enter to outline the object at the new position, or save a simple pin.",
                );
              }
            }}
          />
        )}
        {pins
          .filter((p) => p.id !== editing)
          .map((pin, i) => (
            <button
              type="button"
              key={pin.id}
              className="conn-pin"
              disabled={busy || adding}
              style={{ left: `${pin.x * 100}%`, top: `${pin.y * 100}%` }}
              aria-label={`Edit detail ${i + 1}: ${pin.label}`}
              onClick={() => {
                stopOutline();
                setAdding(true);
                setEditing(pin.id);
                setText(pin.sourceQuote);
                setPosition({ x: pin.x, y: pin.y });
                setCursor({ x: pin.x, y: pin.y });
                setOutline(pin.outline || null);
                setOutlineNotice("");
                requestAnimationFrame(() => textarea.current?.focus());
              }}
            >
              {i + 1}
            </button>
          ))}
        {adding && (
          <span
            className={`conn-pin conn-target ${finding ? "is-finding" : ""}`}
            style={{
              left: `${(position || cursor).x * 100}%`,
              top: `${(position || cursor).y * 100}%`,
            }}
            aria-hidden="true"
          >
            ＋
          </span>
        )}
        {!adding && (
          <span className="conn-image-credit">AI RECONSTRUCTION</span>
        )}
      </div>
      {adding && !position && (
        <p className="conn-placement-hint">
          Tap or click the image to place your detail. You can also focus the
          image, move with arrow keys, and press Enter.
        </p>
      )}
      {adding && position && (
        <div className="conn-note-composer">
          <label className="conn-field">
            What do you remember about this?
            <textarea
              ref={textarea}
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder="That was the bike Dad fixed up for me. I remember the bell never worked."
              disabled={busy}
            />
          </label>
          <div className="conn-note-meta">
            <span>{text.length}/500</span>
            <span role="status">
              {finding ? "Finding the object’s outline…" : outlineNotice}
            </span>
          </div>
          <div className="conn-actions">
            <button
              type="button"
              className="conn-button"
              disabled={busy || !text.trim()}
              onClick={() => void save()}
            >
              {busy ? "Saving…" : "Save detail"}
            </button>
            {(outline || finding) && (
              <button
                type="button"
                className="conn-link"
                disabled={busy}
                onClick={() => {
                  stopOutline();
                  setOutline(null);
                  setOutlineNotice("Your detail will use a simple pin.");
                }}
              >
                Use a simple pin
              </button>
            )}
            <span className="conn-small">
              Saved on this image. Shared when you publish.
            </span>
          </div>
        </div>
      )}
      {pins.length > 0 && (
        <ol className="conn-saved-notes">
          {pins.map((p, i) => (
            <li key={p.id}>
              <span className="conn-note-number">{i + 1}</span>
              <p>{p.sourceQuote}</p>
              <button
                type="button"
                className="conn-link"
                disabled={busy || adding}
                aria-label={`Remove detail ${i + 1}`}
                onClick={async () => {
                  if (await persist(pins.filter((x) => x.id !== p.id)))
                    setNotice(
                      "Detail removed. Publish again to update the shared image.",
                    );
                }}
              >
                Remove
              </button>
            </li>
          ))}
        </ol>
      )}
      <p role="status" className="conn-small">
        {notice}
        {pins.length === 5 && !adding
          ? " You’ve added all five details for this image."
          : ""}
      </p>
    </section>
  );
}
