"use client";
import { useEffect, useRef, useState } from "react";
import type { ReferenceView } from "@/lib/memory/personalization";
import "./reference-photos.css";
type Props = {
  memoryId?: string;
  ensureMemory?: () => Promise<string>;
  onChanged?: () => void | Promise<void>;
  onBusyChange?: (busy: boolean) => void;
};
export async function compressReference(file: File): Promise<Blob> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error("Choose a JPEG, PNG, or WebP photo.");
  if (!file.size || file.size > 25 * 1024 * 1024)
    throw new Error("Choose a photo smaller than 25 MB.");
  const bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width * bitmap.height > 20_000_000)
      throw new Error("Choose a photo up to 20 megapixels.");
    const scale = Math.min(1, 1536 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Your browser could not prepare this photo.");
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) =>
          b ? resolve(b) : reject(new Error("Could not prepare this photo.")),
        "image/webp",
        0.85,
      ),
    );
    if (blob.size > 2.8 * 1024 * 1024)
      throw new Error("This photo is too large. Choose a smaller image.");
    return blob;
  } finally {
    bitmap.close();
  }
}
export function ReferencePhotos({
  memoryId,
  ensureMemory,
  onChanged,
  onBusyChange,
}: Props) {
  const [resolvedId, setResolvedId] = useState(memoryId);
  const id = memoryId || resolvedId;
  const [items, setItems] = useState<ReferenceView[]>([]),
    [photo, setPhoto] = useState<Blob | null>(null);
  const [preview, setPreview] = useState(""),
    [label, setLabel] = useState(""),
    [kind, setKind] = useState("person");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    onBusyChange?.(busy);
    return () => onBusyChange?.(false);
  }, [busy, onBusyChange]);
  const input = useRef<HTMLInputElement>(null);
  const selection = useRef(0);
  const mutations = useRef(0);
  useEffect(() => {
    if (memoryId) setResolvedId(memoryId);
  }, [memoryId]);
  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    const revision = mutations.current;
    fetch(`/api/memories/${id}/references`, { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        if (mutations.current === revision) setItems(data);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => controller.abort();
  }, [id]);
  useEffect(() => {
    if (!photo) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);
  useEffect(
    () => () => {
      selection.current++;
    },
    [],
  );
  async function choose(file?: File) {
    if (!file) return;
    const sequence = ++selection.current;
    setError("");
    setBusy(true);
    setPhoto(null);
    try {
      const blob = await compressReference(file);
      if (selection.current === sequence) setPhoto(blob);
    } catch (e) {
      if (selection.current === sequence)
        setError(e instanceof Error ? e.message : "Could not prepare photo.");
    } finally {
      if (selection.current === sequence) setBusy(false);
    }
  }
  async function save() {
    if (!photo || !label.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const target = id || (await ensureMemory?.());
      if (!target) throw new Error("Save a memory before adding photos.");
      setResolvedId(target);
      const body = new FormData();
      body.set("photo", photo, "reference.webp");
      body.set("label", label.trim());
      body.set("kind", kind);
      const response = await fetch(`/api/memories/${target}/references`, {
        method: "POST",
        body,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      mutations.current++;
      setItems((current) => [
        ...current.filter((item) => item.id !== data.id),
        data,
      ]);
      setPhoto(null);
      setLabel("");
      if (input.current) input.current.value = "";
      await onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save photo.");
    } finally {
      setBusy(false);
    }
  }
  async function remove(referenceId: string) {
    if (busy || !id) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/memories/${id}/references/${referenceId}`,
        { method: "DELETE" },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      mutations.current++;
      setItems((current) => current.filter((item) => item.id !== referenceId));
      await onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove photo.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="reference-photos" aria-label="Reference photos">
      <div className="reference-heading">
        <strong>Familiar faces and places</strong>
        <span>{items.length}/4</span>
      </div>
      <p>
        Add private photos to help the image resemble the people, places, and
        objects in your memory.
      </p>
      {items.length > 0 && (
        <ul className="reference-list">
          {items.map((item) => (
            <li key={item.id}>
              {/* Private owner-only URLs cannot use the public image optimizer. */}
              <img src={item.imageUrl} alt={item.label} />
              <span>
                {item.label}
                <small>{item.kind}</small>
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() => remove(item.id)}
                aria-label={`Remove ${item.label}`}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      {items.length < 4 && (
        <>
          <input
            ref={input}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            hidden
            onChange={(e) => void choose(e.target.files?.[0])}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => input.current?.click()}
          >
            {busy
              ? "Preparing…"
              : photo
                ? "Choose another photo"
                : "Add reference photo"}
          </button>
          {photo && (
            <div className="reference-editor">
              <img src={preview} alt="Photo ready to name" />
              <label>
                Name this photo
                <input
                  value={label}
                  maxLength={80}
                  placeholder="Dad / Our kitchen"
                  onChange={(e) => setLabel(e.target.value)}
                  disabled={busy}
                />
              </label>
              <label>
                What is it?
                <select
                  value={kind}
                  onChange={(e) => setKind(e.target.value)}
                  disabled={busy}
                >
                  <option value="person">Person</option>
                  <option value="place">Place</option>
                  <option value="object">Object</option>
                </select>
              </label>
              <button
                type="button"
                onClick={save}
                disabled={busy || !label.trim()}
              >
                Save photo
              </button>
            </div>
          )}
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
