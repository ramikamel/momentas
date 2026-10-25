"use client";
import { useRef, useState } from "react";
import type { ImageVersionView } from "@/lib/memory/types";
import "./photo-memory.css";
export function PhotoStart({
  ensureMemory,
  onReady,
}: {
  ensureMemory: () => Promise<string>;
  onReady: (id: string, version: ImageVersionView) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [resumable, setResumable] = useState(false);
  const pending = useRef<{ id: string; uploadId: string } | null>(null);
  async function completeUpload() {
    const upload = pending.current;
    if (!upload) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/memories/${upload.id}/source/complete`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ uploadId: upload.uploadId }),
        },
      );
      const version = await response.json();
      if (!response.ok)
        throw Error(version.error || "Could not open this photo.");
      pending.current = null;
      setResumable(false);
      onReady(upload.id, version);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not finish. Retry opening this photo.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function upload(file: File) {
    setBusy(true);
    setError("");
    try {
      if (
        !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
        !file.size ||
        file.size > 12 * 1024 * 1024
      )
        throw Error("Choose a JPEG, PNG or WebP photo smaller than 12 MB.");
      const id = await ensureMemory();
      const init = await fetch(`/api/memories/${id}/source/init`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: file.name,
          mimeType: file.type,
          size: file.size,
        }),
      });
      const data = await init.json();
      if (!init.ok) throw Error(data.error || "Could not prepare your photo.");
      const put = await fetch(data.uploadUrl, {
        method: data.method,
        headers: data.headers,
        body: file,
      });
      if (!put.ok) throw Error("The upload did not finish. Please try again.");
      pending.current = { id, uploadId: data.uploadId };
      setResumable(true);
      await completeUpload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not upload this photo.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }
  return (
    <section className="photo-start" aria-label="Start from a photograph">
      <div className="entry-photo-art" aria-hidden="true">
        <img src="/sample-memory.webp" alt="" />
        <span className="entry-photo-edge">THERE’S MORE BEYOND THE EDGES</span>
      </div>
      <div className="entry-card-copy">
        <span className="eyebrow">START WITH A PHOTOGRAPH</span>
        <h2>Go beyond the frame.</h2>
        <p>
          Bring a photograph and describe what the camera missed. See your
          remembered surroundings come to life.
        </p>
        <input
          ref={input}
          aria-label="Choose your photograph"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
          }}
        />
        <button
          className="button primary"
          disabled={busy}
          onClick={() =>
            resumable ? void completeUpload() : input.current?.click()
          }
        >
          {busy ? "Opening your photograph…" : "Start with a photograph"}
        </button>
        <small>Your original stays just as you remember it.</small>
        {error && <p role="alert">{error}</p>}
        {error && resumable && (
          <button disabled={busy} onClick={() => void completeUpload()}>
            Retry opening photo
          </button>
        )}
      </div>
    </section>
  );
}
