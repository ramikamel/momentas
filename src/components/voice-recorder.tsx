"use client";
import { useState, useRef, useEffect } from "react";
import { normalizeRecording } from "@/lib/memory/audio";
import type { NarrationView } from "@/lib/memory/connections";
import "./connections.css";
export function VoiceRecorder({
  memoryId,
  ensureMemory,
  onUse,
}: {
  memoryId?: string;
  ensureMemory?: () => Promise<string>;
  onUse: (v: { story: string; narrationId: string }) => void;
}) {
  const [recording, setRecording] = useState(false),
    [elapsed, setElapsed] = useState(0),
    [wav, setWav] = useState<Uint8Array | null>(null),
    [url, setUrl] = useState(""),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState(""),
    [error, setError] = useState("");
  const recorder = useRef<MediaRecorder | null>(null),
    stream = useRef<MediaStream | null>(null),
    timer = useRef<ReturnType<typeof setInterval> | null>(null),
    alive = useRef(true),
    memory = useRef(memoryId || "");
  useEffect(() => {
    memory.current = memoryId || memory.current;
  }, [memoryId]);
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
  async function transcribe(bytes: Uint8Array) {
    setBusy(true);
    setError("");
    setStatus("Writing down what you said…");
    try {
      let id = memory.current;
      if (!id) {
        if (!ensureMemory) throw new Error("Save the memory before recording.");
        id = await ensureMemory();
        memory.current = id;
      }
      const body = new FormData();
      body.set(
        "audio",
        new Blob([new Uint8Array(bytes)], { type: "audio/wav" }),
        "memory.wav",
      );
      const uploaded = await fetch(`/api/memories/${id}/narrations`, {
        method: "POST",
        body,
      });
      const narration = await uploaded.json();
      if (!uploaded.ok) throw new Error(narration.error);
      const r = await fetch(
        `/api/memories/${id}/narrations/${(narration as NarrationView).id}/transcribe`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requestId: crypto.randomUUID() }),
        },
      );
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      const story = String(data.transcript ?? "").trim();
      if (!story)
        throw new Error(
          "No words were heard. Record again, or type the memory below.",
        );
      if (alive.current) {
        onUse({ story, narrationId: data.id });
        setStatus("Your words are in the memory below. You can edit them there.");
      }
    } catch (e) {
      if (alive.current)
        setError(
          e instanceof Error
            ? e.message
            : "Could not transcribe. Your words are still here.",
        );
      if (alive.current) setStatus("");
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  async function start() {
    setError("");
    setStatus("");
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
          if (!alive.current) return;
          setWav(normalized);
          await transcribe(normalized);
        } catch {
          if (alive.current) {
            setBusy(false);
            setError(
              "We could not read that recording. Record at least one second, or type your memory.",
            );
          }
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
  return (
    <section className="conn-recorder">
      <div>
        <span className="conn-eyebrow">A memory sounds like you</span>
        <h3>Tell it in your own voice.</h3>
        <p className="conn-muted">
          Record up to a minute. When you stop, your words go straight into the
          memory below.
        </p>
      </div>
      <div className="conn-actions">
        <button
          type="button"
          className="conn-button"
          disabled={busy}
          onClick={recording ? stop : start}
        >
          {recording
            ? `Stop recording · ${elapsed}s`
            : wav
              ? "Record again"
              : "Record my memory"}
        </button>
        {wav && !recording && error && (
          <button
            type="button"
            className="conn-button secondary"
            disabled={busy}
            onClick={() => void transcribe(wav)}
          >
            {busy ? "Writing down what you said…" : "Try again"}
          </button>
        )}
      </div>
      {url && <audio src={url} controls aria-label="Preview your recording" />}
      {status && (
        <p className="conn-small" role="status">
          {status}
        </p>
      )}
      {wav && (
        <button
          className="conn-link"
          type="button"
          disabled={busy}
          onClick={() => {
            setWav(null);
            setError("");
            setStatus("");
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
