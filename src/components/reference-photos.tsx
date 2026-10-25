"use client";
import { useEffect, useId, useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
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
    [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [status, setStatus] = useState("");
  const nameId = useId();
  const nameInput = useRef<HTMLInputElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    onBusyChange?.(busy || !!photo);
    return () => onBusyChange?.(false);
  }, [busy, photo, onBusyChange]);
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
  useEffect(() => {
    if (preview) nameInput.current?.focus();
  }, [preview]);
  function cancel() {
    selection.current++;
    setPhoto(null);
    setLabel("");
    setError("");
    if (input.current) input.current.value = "";
    uploadButton.current?.focus();
  }
  const uploadButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!busy && !photo && status)
      (uploadButton.current ?? heading.current)?.focus();
  }, [busy, photo, status]);
  async function choose(file?: File) {
    if (!file) return;
    const sequence = ++selection.current;
    setError("");
    setStatus("");
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
      setStatus(`Added ${data.label}. Mention this name in your memory.`);
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
      setStatus("Image removed.");
      await onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove photo.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="reference-photos"
      aria-label="Reference photos"
      aria-busy={busy}
    >
      <div className="reference-heading">
        <div>
          <h3 ref={heading} tabIndex={-1}>
            Pictures to remember by
          </h3>
          <p>Name a picture, then mention it in your memory.</p>
        </div>
        {items.length < 4 && (
          <button
            ref={uploadButton}
            className="reference-upload"
            type="button"
            disabled={busy}
            onClick={() => input.current?.click()}
          >
            <ImagePlus size={18} aria-hidden="true" />
            {busy ? "Please wait…" : photo ? "Change image" : "Upload image"}
          </button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        aria-label="Upload a reference image"
        hidden
        onChange={(e) => void choose(e.target.files?.[0])}
      />
      {photo && (
        <div className="reference-editor">
          <div className="reference-preview">
            {preview && <img src={preview} alt="Selected image" />}
          </div>
          <div className="reference-name">
            <label htmlFor={nameId}>What should we call this?</label>
            <input
              ref={nameInput}
              id={nameId}
              value={label}
              maxLength={80}
              placeholder="Dad, our kitchen, my red bike…"
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void save();
                }
              }}
              disabled={busy}
            />
            <div className="reference-editor-actions">
              <button
                className="reference-save"
                type="button"
                onClick={() => void save()}
                disabled={busy || !label.trim()}
              >
                {busy ? "Adding…" : "Add image"}
              </button>
              <button
                className="reference-cancel"
                type="button"
                disabled={busy}
                onClick={cancel}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      {items.length > 0 && (
        <ul className="reference-list" aria-label="Added images">
          {items.map((item) => (
            <li key={item.id}>
              <img src={item.imageUrl} alt={item.label} />
              <span className="reference-label">{item.label}</span>
              <button
                className="reference-remove"
                type="button"
                disabled={busy}
                onClick={() => void remove(item.id)}
                aria-label={`Remove ${item.label}`}
              >
                <X size={16} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="reference-footer">
        <span>These pictures stay private.</span>
        <span>{items.length} of 4 added</span>
      </div>
      <p className="reference-status" role="status">
        {status}
      </p>
      {error && (
        <p className="reference-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
