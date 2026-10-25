import { randomUUID } from "node:crypto";
import type { Store } from "../memory/types";
import type {
  AuthorAuth,
  NarrationRecord,
  NarrationView,
} from "../memory/connections";
import { validateWav } from "../memory/audio";
import { AppError } from "./access";
import { requireAuthor, authorizePublishedNarration } from "./authorization";
import { transcribeVoice } from "./voice";
export class VoiceService {
  constructor(
    private store: Store,
    private transcribeProvider = transcribeVoice,
  ) {}
  private async view(n: NarrationRecord): Promise<NarrationView> {
    const { audioPath: _, ...value } = n;
    void _;
    return { ...value, audioUrl: await this.store.audioUrl(n) };
  }
  async upload(auth: AuthorAuth, wav: Uint8Array): Promise<NarrationView> {
    await requireAuthor(this.store, auth);
    let durationMs: number;
    try {
      durationMs = validateWav(wav).durationMs;
    } catch {
      throw new AppError(
        "Please record a valid 1–60 second WAV clip.",
        400,
        "INVALID_AUDIO",
      );
    }
    const id = randomUUID(),
      audioPath = `${auth.memoryId}/${id}.wav`;
    const n: NarrationRecord = {
      id,
      memoryId: auth.memoryId,
      audioPath,
      durationMs,
      transcript: null,
      transcriptionStatus: "idle",
      createdAt: new Date().toISOString(),
    };
    await this.store.putAudio(audioPath, wav);
    try {
      await this.store.saveNarration(n);
    } catch (error) {
      await this.store.removeAudio(audioPath);
      throw error;
    }
    return this.view(n);
  }
  async transcribe(
    auth: AuthorAuth,
    narrationId: string,
    requestId: string,
  ): Promise<NarrationView> {
    await requireAuthor(this.store, auth);
    if (!/^[0-9a-f-]{36}$/i.test(requestId))
      throw new AppError("Provide a valid request ID.");
    const n = await this.store.getNarration(narrationId);
    if (!n || n.memoryId !== auth.memoryId)
      throw new AppError("Recording not found.", 404);
    if (n.transcriptionStatus === "complete") return this.view(n);
    const configured = Number(process.env.MAX_VOICE_REQUESTS || 24);
    const reservation = await this.store.reserveConnectionRequest(
      "voice",
      n.id,
      requestId,
      Number.isInteger(configured) && configured > 0 ? configured : 24,
    );
    if (reservation === "completed") {
      const saved = await this.store.getNarration(n.id);
      return this.view(saved!);
    }
    try {
      const result = await this.transcribeProvider(
        await this.store.readAudio(n.audioPath),
      );
      if (
        !result.transcript.trim() ||
        Math.abs(result.audioDurationMs - n.durationMs) > 1000
      )
        throw new AppError(
          "We could not reliably transcribe this recording. Retry or type your memory.",
          502,
        );
      const saved = {
        ...n,
        transcript: result.transcript,
        transcriptionStatus: "complete" as const,
      };
      await this.store.completeConnectionRequest("voice", n.id, requestId, {
        transcript: result.transcript,
      });
      return this.view(saved);
    } catch (error) {
      await this.store.failConnectionRequest("voice", n.id, requestId);
      throw error;
    }
  }
  async getAudio(
    memoryId: string,
    narrationId: string,
    ownerToken: string,
    shareToken?: string,
    comparisonToken?: string,
  ): Promise<Uint8Array> {
    if (ownerToken) {
      await requireAuthor(this.store, { memoryId, ownerToken });
    } else {
      await authorizePublishedNarration(this.store, memoryId, narrationId, {
        share: shareToken,
        comparison: comparisonToken,
      });
    }
    const n = await this.store.getNarration(narrationId);
    if (!n || n.memoryId !== memoryId)
      throw new AppError("Recording not found.", 404);
    return this.store.readAudio(n.audioPath);
  }
}
