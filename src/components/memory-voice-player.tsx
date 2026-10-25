"use client";
import type { NarrationView } from "@/lib/memory/connections";
import "./connections.css";
export function MemoryVoicePlayer({
  narration,
}: {
  narration: NarrationView;
  group?: string;
}) {
  return (
    <section className="conn-voice-player">
      <span className="conn-eyebrow">
        In their own voice · {Math.round(narration.durationMs / 1000)}s
      </span>
      <audio
        controls
        preload="none"
        src={narration.audioUrl}
        onPlay={(e) => {
          document.querySelectorAll("audio").forEach((audio) => {
            if (audio !== e.currentTarget) audio.pause();
          });
        }}
        aria-label="Play the storyteller’s recorded voice"
      />
      {narration.transcript && (
        <details>
          <summary>Read the original transcript</summary>
          <p>{narration.transcript}</p>
          <small>The reviewed memory may use different words.</small>
        </details>
      )}
    </section>
  );
}
