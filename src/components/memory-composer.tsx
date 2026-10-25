"use client";
import { VoiceRecorder } from "./voice-recorder";
export function MemoryComposer({
  memoryId,
  label,
  text,
  onText,
  onSave,
  onVoice,
  onBusy,
  busy,
  saving,
  recordingDisabled,
  maxLength,
  onUploaded,
  resumeNarrationId,
}: {
  memoryId: string;
  onUploaded: (v: { narrationId: string }) => Promise<void>;
  resumeNarrationId?: string;
  label: string;
  text: string;
  onText: (s: string) => void;
  onSave: () => void;
  onVoice: (v: { story: string; narrationId: string }) => Promise<void>;
  onBusy: (busy: boolean) => void;
  busy: boolean;
  saving: boolean;
  recordingDisabled: boolean;
  maxLength: number;
}) {
  return (
    <div className="photo-composer">
      <label htmlFor="photo-memory-words">{label}</label>
      <textarea
        id="photo-memory-words"
        rows={6}
        value={text}
        maxLength={maxLength}
        placeholder="Something only you remember…"
        onChange={(e) => onText(e.target.value)}
      />
      <fieldset disabled={recordingDisabled} className="photo-recording">
        <VoiceRecorder
          memoryId={memoryId}
          onUse={onVoice}
          onUploaded={onUploaded}
          resumeNarrationId={resumeNarrationId}
          onBusyChange={onBusy}
        />
      </fieldset>
      <button
        className="button primary"
        disabled={busy || saving}
        onClick={onSave}
      >
        {saving ? "Saving…" : "Save words"}
      </button>
    </div>
  );
}
