"use client";
import { useState, useRef, useEffect } from "react";
import { normalizeRecording } from "@/lib/memory/audio";
import type { NarrationView } from "@/lib/memory/connections";
import "./connections.css";

type Props = {
  memoryId?: string;
  ensureMemory?: () => Promise<string>;
  onUse: (value: {
    story: string;
    narrationId: string;
  }) => void | Promise<void>;
  onSelect?: (id: string) => void;
  onUploaded?: (value: { narrationId: string }) => Promise<void>;
  resumeNarrationId?: string;
  onBusyChange?: (busy: boolean) => void;
};

export function VoiceRecorder(props: Props) {
  const [recording, setRecording] = useState(false);
  const [starting, setStarting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [wav, setWav] = useState<Uint8Array | null>(null);
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [complete, setComplete] = useState(false);
  const { onBusyChange } = props;
  const callbacks = useRef(props);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const alive = useRef(true);
  const locked = useRef(false);
  const request = useRef<AbortController | null>(null);
  const uploaded = useRef<{
    memoryId: string;
    narration: Pick<NarrationView, "id">;
    attached: boolean;
    callbacks: Props;
  } | null>(null);
  const captureCallbacks = useRef<Props | null>(null);
  useEffect(() => {
    callbacks.current = props;
  }, [props]);
  useEffect(() => {
    onBusyChange?.(recording || starting || busy);
  }, [recording, starting, busy, onBusyChange]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      request.current?.abort();
      if (timer.current) clearInterval(timer.current);
      const active = recorder.current;
      if (active) {
        active.onstop = null;
        active.onerror = null;
        active.ondataavailable = null;
        if (active.state !== "inactive") active.stop();
      }
      stream.current?.getTracks().forEach((track) => track.stop());
      callbacks.current.onBusyChange?.(false);
    };
  }, []);
  useEffect(() => {
    if (!wav) return;
    const value = URL.createObjectURL(
      new Blob([new Uint8Array(wav)], { type: "audio/wav" }),
    );
    setUrl(value);
    return () => URL.revokeObjectURL(value);
  }, [wav]);

  function stop() {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    if (recorder.current?.state === "recording") recorder.current.stop();
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    if (alive.current) setRecording(false);
  }

  async function transcribe(bytes?: Uint8Array) {
    setError("");
    const controller = new AbortController();
    request.current = controller;
    try {
      let clip = uploaded.current;
      if (
        !clip &&
        callbacks.current.resumeNarrationId &&
        callbacks.current.memoryId
      ) {
        clip = {
          memoryId: callbacks.current.memoryId,
          narration: { id: callbacks.current.resumeNarrationId },
          attached: true,
          callbacks: callbacks.current,
        };
        uploaded.current = clip;
      }
      if (!clip) {
        const frozen = captureCallbacks.current ?? callbacks.current;
        const memoryId = frozen.memoryId ?? (await frozen.ensureMemory?.());
        if (!alive.current) return;
        if (!memoryId)
          throw new Error("Could not prepare your memory. Please try again.");
        if (!bytes) throw new Error("Choose a saved recording to resume.");
        const body = new FormData();
        body.set(
          "audio",
          new Blob([new Uint8Array(bytes)], { type: "audio/wav" }),
          "memory.wav",
        );
        const response = await fetch(`/api/memories/${memoryId}/narrations`, {
          method: "POST",
          body,
          signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok)
          throw new Error(
            data.error || "Could not save your recording. Please retry.",
          );
        if (!alive.current) return;
        clip = {
          memoryId,
          narration: data as NarrationView,
          attached: false,
          callbacks: frozen,
        };
        uploaded.current = clip;
      }
      if (!clip.attached) {
        await clip.callbacks.onUploaded?.({ narrationId: clip.narration.id });
        clip.attached = true;
        if (!alive.current) return;
      }
      const response = await fetch(
        `/api/memories/${clip.memoryId}/narrations/${clip.narration.id}/transcribe`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requestId: crypto.randomUUID() }),
          signal: controller.signal,
        },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          data.error ||
            "Could not transcribe. Your recording is saved; please retry.",
        );
      if (!alive.current) return;
      const narration = data as NarrationView;
      uploaded.current = { ...clip, narration };
      if (!narration.transcript?.trim())
        throw new Error(
          "No words were found. Try transcription again or record a new clip.",
        );
      await clip.callbacks.onUse({
        story: narration.transcript,
        narrationId: narration.id,
      });
      if (alive.current) setComplete(true);
    } catch (cause) {
      if (alive.current)
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not transcribe. Your recording is still here.",
        );
    } finally {
      if (alive.current) setBusy(false);
      locked.current = false;
    }
  }

  async function start() {
    if (locked.current) return;
    setError("");
    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined" ||
      typeof AudioContext === "undefined"
    ) {
      setError(
        "Recording is not supported here. You can still type your memory.",
      );
      return;
    }
    locked.current = true;
    captureCallbacks.current = callbacks.current;
    setStarting(true);
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!alive.current) {
        media.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = media;
      const mime = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find(
        (type) => MediaRecorder.isTypeSupported(type),
      );
      const active = new MediaRecorder(
        media,
        mime ? { mimeType: mime } : undefined,
      );
      recorder.current = active;
      const chunks: Blob[] = [];
      let failed = false;
      active.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      active.onerror = () => {
        failed = true;
        stop();
        locked.current = false;
        if (alive.current)
          setError("Recording failed. Try again or type your memory.");
      };
      active.onstop = async () => {
        if (!alive.current || failed) return;
        setBusy(true);
        try {
          const normalized = await normalizeRecording(
            new Blob(chunks, { type: active.mimeType }),
          );
          if (!alive.current) return;
          setWav(normalized);
          await transcribe(normalized);
        } catch {
          if (alive.current) {
            setError(
              "We could not read that recording. Record at least one second, or type your memory.",
            );
            setBusy(false);
          }
          locked.current = false;
        }
      };
      active.start();
      uploaded.current = null;
      setWav(null);
      setUrl("");
      setComplete(false);
      setRecording(true);
      setElapsed(0);
      const began = Date.now();
      timer.current = setInterval(() => {
        const seconds = Math.floor((Date.now() - began) / 1000);
        if (alive.current) setElapsed(Math.min(seconds, 60));
        if (seconds >= 60) stop();
      }, 250);
    } catch {
      stream.current?.getTracks().forEach((track) => track.stop());
      stream.current = null;
      locked.current = false;
      if (alive.current)
        setError(
          "Microphone access was unavailable. You can still type your memory.",
        );
    } finally {
      if (alive.current) setStarting(false);
    }
  }

  return (
    <section className="conn-recorder" aria-label="Voice recording">
      <div>
        <span className="conn-eyebrow">A memory sounds like you</span>
        <h3>Tell it in your own voice.</h3>
        <p className="conn-muted">
          Record up to a minute. Stop to add your words to the story below,
          where you can edit them.
        </p>
      </div>
      <div className="conn-actions">
        <button
          type="button"
          className="conn-button"
          disabled={
            busy || starting || (!!props.resumeNarrationId && !complete)
          }
          onClick={recording ? stop : start}
        >
          {recording
            ? `Stop recording · ${elapsed}s`
            : starting
              ? "Opening microphone…"
              : wav
                ? "Record another clip"
                : "Record my memory"}
        </button>
        {props.resumeNarrationId && !wav && !complete && (
          <button
            type="button"
            className="conn-button secondary"
            disabled={busy || starting}
            onClick={() => {
              if (locked.current) return;
              locked.current = true;
              setBusy(true);
              void transcribe();
            }}
          >
            Resume saved recording
          </button>
        )}
        {wav && error && !recording && (
          <button
            type="button"
            className="conn-button secondary"
            disabled={busy}
            onClick={() => {
              if (locked.current) return;
              locked.current = true;
              setBusy(true);
              void transcribe(wav);
            }}
          >
            Retry transcription
          </button>
        )}
      </div>
      <p className="conn-small" role="status">
        {busy
          ? "Adding your recorded words to the story…"
          : complete
            ? "Your recorded words were added to the story. You can edit them below."
            : "Your recording stays private unless you choose to publish it."}
      </p>
      {url && <audio src={url} controls aria-label="Preview your recording" />}
      {wav && (
        <button
          className="conn-link"
          type="button"
          disabled={busy || recording || starting}
          onClick={() => {
            setWav(null);
            setUrl("");
            setComplete(false);
            setError("");
            uploaded.current = null;
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
