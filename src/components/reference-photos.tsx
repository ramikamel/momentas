"use client";
import { useState } from "react";
import type { VisualReferenceView } from "@/lib/memory/references";

export type PendingReference = {
  id: string;
  name: string;
  kind: "person" | "place";
  imageUrl: string;
  file?: File;
  uploaded?: boolean;
};

export function ReferencePhotos({
  memoryId,
  references,
  onChange,
  disabled,
}: {
  memoryId: string | null;
  references: PendingReference[];
  onChange: (next: PendingReference[]) => void;
  disabled?: boolean;
}) {
  const [name, setName] = useState(""),
    [kind, setKind] = useState<"person" | "place">("person"),
    [file, setFile] = useState<File | null>(null),
    [error, setError] = useState("");
  async function add() {
    if (!file || !name.trim() || disabled) return;
    setError("");
    if (!memoryId) {
      onChange([
        ...references,
        {
          id: crypto.randomUUID(),
          name: name.trim(),
          kind,
          imageUrl: URL.createObjectURL(file),
          file,
        },
      ]);
      setName("");
      setFile(null);
      return;
    }
    const body = new FormData();
    body.set("name", name.trim());
    body.set("kind", kind);
    body.set("image", file);
    const r = await fetch(`/api/memories/${memoryId}/references`, {
      method: "POST",
      body,
    });
    const data = await r.json();
    if (!r.ok) {
      setError(data.error || "Could not add that picture.");
      return;
    }
    onChange([...references, data as VisualReferenceView]);
    setName("");
    setFile(null);
  }
  async function remove(reference: PendingReference) {
    if (reference.file) {
      if (reference.imageUrl.startsWith("blob:"))
        URL.revokeObjectURL(reference.imageUrl);
      onChange(references.filter((item) => item.id !== reference.id));
      return;
    }
    if (!memoryId) return;
    const r = await fetch(
      `/api/memories/${memoryId}/references/${reference.id}`,
      { method: "DELETE" },
    );
    if (!r.ok && r.status !== 204) {
      const data = await r.json().catch(() => ({}));
      setError(data.error || "Could not remove that picture.");
      return;
    }
    onChange(references.filter((item) => item.id !== reference.id));
  }
  return (
    <div className={`reference-photos${disabled ? " is-disabled" : ""}`}>
      <span className="reference-legend">Pictures that should show up</span>
      <p className="muted small">
        Add a photo of a person or a place, and the name you use for them in
        the memory. Mention that name when you tell it — Dad, the kitchen —
        and the reconstruction uses the photo for them.
      </p>
      {references.length > 0 && (
        <ul className="reference-list">
          {references.map((reference) => (
            <li key={reference.id}>
              <img src={reference.imageUrl} alt="" />
              <span>
                <strong>{reference.name}</strong>
                <small>{reference.kind === "person" ? "Person" : "Place"}</small>
              </span>
              <button
                type="button"
                className="quiet-link"
                onClick={() => void remove(reference)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      {references.length < 4 && (
        <div className="reference-add">
          <label className="field">
            <span>Name in the memory</span>
            <input
              maxLength={40}
              placeholder="Dad"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="field">
            <span>This picture is</span>
            <select
              value={kind}
              onChange={(e) =>
                setKind(e.target.value === "place" ? "place" : "person")
              }
            >
              <option value="person">A person</option>
              <option value="place">A place</option>
            </select>
          </label>
          <label className="field">
            <span>Photo</span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <button
            type="button"
            className="button subtle"
            disabled={!file || !name.trim()}
            onClick={() => void add()}
          >
            Add this picture
          </button>
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export async function uploadPendingReferences(
  memoryId: string,
  references: PendingReference[],
) {
  const next = [...references];
  for (let i = 0; i < next.length; i++) {
    const reference = next[i];
    if (!reference.file || reference.uploaded) continue;
    const body = new FormData();
    body.set("name", reference.name);
    body.set("kind", reference.kind);
    body.set("image", reference.file);
    const r = await fetch(`/api/memories/${memoryId}/references`, {
      method: "POST",
      body,
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "Could not add that picture.");
    if (reference.imageUrl.startsWith("blob:"))
      URL.revokeObjectURL(reference.imageUrl);
    next[i] = { ...(data as VisualReferenceView), uploaded: true };
  }
  return next;
}
