"use client";
import { useEffect, useId, useRef, useState } from "react";
import type { ImageVersionView } from "@/lib/memory/types";
import type { PinDraft, PublicPin } from "@/lib/memory/connections";
import { DetailOutline } from "./detail-outline";
import "./connections.css";
import "./object-details.css";
import type { DetectedObject, ObjectMap } from "@/lib/memory/personalization";
type Position = {
  x: number;
  y: number;
};
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
  const [objectMap, setObjectMap] = useState<ObjectMap | null>(null),
    [objects, setObjects] = useState<DetectedObject[]>([]),
    [concept, setConcept] = useState(""),
    [preparing, setPreparing] = useState(true),
    [scan, setScan] = useState(0),
    [manual, setManual] = useState(false);
  const objectUrl = `/api/memories/${memoryId}/versions/${version.id}/objects`;
  useEffect(() => {
    let active = true,
      timer: ReturnType<typeof setTimeout>;
    async function load(prepare = false) {
      try {
        const response = await fetch(
          objectUrl,
          prepare
            ? {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ retry: scan > 0 }),
              }
            : undefined,
        );
        const data = await response.json();
        if (!active) return;
        if (!response.ok)
          throw new Error(data.error || "Object preparation unavailable.");
        if (!data.map && !prepare) {
          void load(true);
          return;
        }
        setObjectMap(data.map);
        setObjects(data.map?.objects || []);
        setPreparing(data.map?.status === "pending");
        if (data.map?.status === "pending")
          timer = setTimeout(() => void load(), 2000);
      } catch {
        if (active) {
          setPreparing(false);
          setOutlineNotice(
            "Object preparation unavailable. You can place a simple pin.",
          );
        }
      }
    }
    setPreparing(true);
    void load(scan > 0);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [objectUrl, scan]);
  function chooseObject(object: DetectedObject) {
    stopOutline();
    setAdding(true);
    setManual(false);
    setPosition({ x: object.x, y: object.y });
    setOutline(object.outline);
    setOutlineNotice(
      `Selected ${object.label}. Choose another object to change the target.`,
    );
    requestAnimationFrame(() => textarea.current?.focus());
  }
  async function findObject() {
    if (!concept.trim() || finding) return;
    setFinding(true);
    try {
      const response = await fetch(objectUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ concept }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Could not find this object.");
      setObjects((current) => [
        ...current.filter(
          (o) => !data.objects.some((n: DetectedObject) => n.id === o.id),
        ),
        ...data.objects,
      ]);
      if (data.objects.length) chooseObject(data.objects[0]);
      else
        setOutlineNotice(
          "No matching object found. Try another name or place a pin.",
        );
    } catch (error) {
      setOutlineNotice(
        error instanceof Error ? error.message : "Could not find this object.",
      );
    } finally {
      setFinding(false);
    }
  }
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
    setManual(false);
    setPosition(null);
    setText("");
    setEditing(null);
    setOutline(null);
    setOutlineNotice("");
    requestAnimationFrame(() => addButton.current?.focus());
  }
  async function place(point: Position) {
    stopOutline();
    setPosition(point);
    setCursor(point);
    setOutline(null);
    setFinding(false);
    setOutlineNotice("Your detail will use a simple pin.");
    requestAnimationFrame(() => textarea.current?.focus());
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
              setManual(true);
              setNotice("");
              setCursor({ x: 0.5, y: 0.5 });
            }}
          >
            ＋ Place a simple pin
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
        {!manual && (
          <svg
            fillRule="evenodd"
            className="object-map-overlay"
            viewBox="0 0 1000 1000"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {[...objects]
              .sort((a, b) => b.area - a.area)
              .map((object) => (
                <path
                  key={object.id}
                  d={object.outline.path}
                  className={
                    outline?.path === object.outline.path ? "selected" : ""
                  }
                  onClick={() => {
                    if (!busy && (adding || pins.length < 5))
                      chooseObject(object);
                  }}
                />
              ))}
          </svg>
        )}
        {adding && manual && (
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
              const delta: {
                [key: string]: Position;
              } = {
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
      <div className="object-map-controls">
        <p role="status" className="conn-small">
          {preparing
            ? "Preparing selectable objects…"
            : objectMap?.status === "failed"
              ? "Object preparation failed. Place a pin or retry."
              : objects.length
                ? "Choose an outlined object, then tell its story."
                : "No objects found. Search for an object or place a pin."}
        </p>
        <button
          type="button"
          className="conn-link"
          disabled={preparing || busy || finding}
          onClick={() => setScan((current) => current + 1)}
        >
          {objectMap?.status === "failed"
            ? "Retry preparation"
            : "Refresh outlines"}
        </button>
        <div className="object-map-buttons">
          {objects.map((object, i) => (
            <button
              type="button"
              className="conn-button secondary"
              key={object.id}
              disabled={busy || (!adding && pins.length >= 5)}
              aria-label={`Select ${object.label}${objects.filter((o) => o.label === object.label).length > 1 ? ` ${i + 1}` : ""}`}
              aria-pressed={outline?.path === object.outline.path}
              onClick={() => chooseObject(object)}
            >
              {object.label}
            </button>
          ))}
        </div>
        <div className="object-map-search">
          <label>
            Find an object
            <input
              value={concept}
              onChange={(e) => setConcept(e.target.value)}
              placeholder="e.g. helmet"
              maxLength={60}
              disabled={busy || finding}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void findObject();
                }
              }}
            />
          </label>
          <button
            type="button"
            className="conn-button secondary"
            disabled={
              busy ||
              finding ||
              !concept.trim() ||
              (!adding && pins.length >= 5)
            }
            onClick={() => void findObject()}
          >
            {finding ? "Finding…" : "Find object"}
          </button>
        </div>
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
