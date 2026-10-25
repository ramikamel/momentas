"use client";
import { useState, useRef, useEffect } from "react";
import { normalizeRecording } from "@/lib/memory/audio";
import type { NarrationView } from "@/lib/memory/connections";
import "./connections.css";
export function VoiceRecorder({
  memoryId,
  onUse,
  onSelect,
}: {
  memoryId: string;
  onUse: (v: { story: string; narrationId: string }) => void;
  onSelect?: (id: string) => void;
}) {
  const [recording, setRecording] = useState(false),
    [elapsed, setElapsed] = useState(0),
    [wav, setWav] = useState<Uint8Array | null>(null),
    [url, setUrl] = useState(""),
    [saved, setSaved] = useState<NarrationView | null>(null),
    [text, setText] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const recorder = useRef<MediaRecorder | null>(null),
    stream = useRef<MediaStream | null>(null),
    timer = useRef<ReturnType<typeof setInterval> | null>(null),
    alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (timer.current) clearInterval(timer.current);
      if (recorder.current?.state === "recording") recorder.current.stop();
      stream.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);
  useEffect(() => {
    if (!wav) {
      setUrl("");
      return;
    }
    const value = URL.createObjectURL(
      new Blob([new Uint8Array(wav)], { type: "audio/wav" }),
    );
    setUrl(value);
    return () => URL.revokeObjectURL(value);
  }, [wav]);
  function stop() {
    if (timer.current) clearInterval(timer.current);
    if (recorder.current?.state === "recording") recorder.current.stop();
    stream.current?.getTracks().forEach((t) => t.stop());
    setRecording(false);
  }
  async function start() {
    setError("");
    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      setError(
        "Recording is not supported here. You can still type your memory.",
      );
      return;
    }
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!alive.current) {
        media.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = media;
      const mime = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find(
        (t) => MediaRecorder.isTypeSupported(t),
      );
      const r = new MediaRecorder(media, mime ? { mimeType: mime } : undefined);
      recorder.current = r;
      const chunks: Blob[] = [];
      r.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      r.onerror = () => {
        stop();
        setError("Recording failed. Try again or type your memory.");
      };
      r.onstop = async () => {
        if (!alive.current) return;
        setBusy(true);
        try {
          const normalized = await normalizeRecording(
            new Blob(chunks, { type: r.mimeType }),
          );
          if (alive.current) {
            setWav(normalized);
            setSaved(null);
            setText("");
          }
        } catch {
          if (alive.current)
            setError(
              "We could not read that recording. Record at least one second, or type your memory.",
            );
        } finally {
          if (alive.current) setBusy(false);
        }
      };
      r.start();
      setRecording(true);
      setElapsed(0);
      const began = Date.now();
      timer.current = setInterval(() => {
        const seconds = Math.floor((Date.now() - began) / 1000);
        setElapsed(Math.min(seconds, 60));
        if (seconds >= 60) stop();
      }, 250);
    } catch {
      stream.current?.getTracks().forEach((t) => t.stop());
      setError(
        "Microphone access was unavailable. You can still type your memory.",
      );
    }
  }
  async function transcribe() {
    if (!wav) return;
    setBusy(true);
    setError("");
    try {
      let n = saved;
      if (!n) {
        const body = new FormData();
        body.set(
          "audio",
          new Blob([new Uint8Array(wav)], { type: "audio/wav" }),
          "memory.wav",
        );
        const r = await fetch(`/api/memories/${memoryId}/narrations`, {
          method: "POST",
          body,
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error);
        n = data as NarrationView;
        setSaved(n);
      }
      const r = await fetch(
        `/api/memories/${memoryId}/narrations/${n.id}/transcribe`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requestId: crypto.randomUUID() }),
        },
      );
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      setSaved(data);
      setText(data.transcript ?? "");
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not transcribe. Your words are still here.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="conn-recorder">
      <div>
        <span className="conn-eyebrow">A memory sounds like you</span>
        <h3>Tell it in your own voice.</h3>
        <p className="conn-muted">
          Record up to a minute. Review the transcript before using it. Your
          words below stay yours to edit.
        </p>
      </div>
      <div className="conn-actions">
        <button
          type="button"
          className="conn-button"
          disabled={busy}
          onClick={recording ? stop : start}
        >
          {recording ? `Stop recording · ${elapsed}s` : "Record my memory"}
        </button>
        {wav && !recording && (
          <button
            type="button"
            className="conn-button secondary"
            disabled={busy}
            onClick={transcribe}
          >
            {busy
              ? "Preparing your words…"
              : saved?.transcript
                ? "Transcribe again"
                : "Transcribe recording"}
          </button>
        )}
      </div>
      {url && <audio src={url} controls aria-label="Preview your recording" />}
      {saved && (
        <button
          type="button"
          className="conn-link"
          disabled={busy}
          onClick={() => onSelect?.(saved.id)}
        >
          Use this recording with my written memory
        </button>
      )}
      {text && (
        <>
          <label className="conn-field">
            Review your transcript
            <textarea
              rows={4}
              maxLength={6000}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="conn-button"
            disabled={!text.trim() || !saved}
            onClick={() =>
              saved && onUse({ story: text, narrationId: saved.id })
            }
          >
            Use transcript
          </button>
          <p className="conn-small">
            This replaces the written account and asks you to review the scene
            again.
          </p>
        </>
      )}
      {wav && (
        <button
          className="conn-link"
          type="button"
          disabled={busy}
          onClick={() => {
            setWav(null);
            setSaved(null);
            setText("");
            setError("");
          }}
        >
          Discard this recording
        </button>
      )}
      {error && (
        <p className="conn-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
