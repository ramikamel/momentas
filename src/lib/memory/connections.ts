import type { MemoryRecord, MemoryMessage, ImageVersion } from "./types";
export type AuthorAuth = { memoryId: string; ownerToken: string };
export type PublicPin = {
  id: string;
  x: number;
  y: number;
  label: string;
  sourceQuote: string;
  origin?: "author";
  outline?: { path: string };
};
export type PinDraft = PublicPin & { detailPath: string };
export type NarrationRecord = {
  id: string;
  memoryId: string;
  audioPath: string;
  durationMs: number;
  transcript: string | null;
  transcriptionStatus: "idle" | "pending" | "complete" | "failed";
  createdAt: string;
};
export type NarrationView = Omit<NarrationRecord, "audioPath"> & {
  audioUrl: string;
};
export type PublicationSnapshot = {
  id: string;
  memoryId: string;
  versionId: string;
  title: string;
  authorName: string;
  recipientName: string;
  caption: string;
  pins: PublicPin[];
  narrationId: string | null;
  createdAt: string;
};
export type PublicationView = PublicationSnapshot & {
  imageOrigin?: "source" | "generated";
  sourceImageUrl?: string;
  imageUrl: string;
  narration: NarrationView | null;
};
export type Evidence = { side: "left" | "right"; quote: string };
export type ComparisonSynthesis = {
  shared: { text: string; evidence: Evidence[] }[];
  distinct: { side: "left" | "right"; text: string; evidence: Evidence[] }[];
  questions: string[];
};
export type ComparisonSource = {
  publicationId: string;
  authorName: string;
  caption: string;
  pins: PublicPin[];
};
export type PerspectiveLink = {
  id: string;
  originalMemoryId: string;
  originalPublicationId: string;
  eventLabel: string;
  inviteTokenHash: string;
  comparisonTokenHash: string;
  contributionMemoryId: string | null;
  contributionPublicationId: string | null;
  synthesisStatus: "idle" | "pending" | "complete" | "failed";
  synthesis: ComparisonSynthesis | null;
  createdAt: string;
};
export type ComparisonView = {
  left: PublicationView;
  right: PublicationView;
  synthesisStatus: PerspectiveLink["synthesisStatus"];
  synthesis: ComparisonSynthesis | null;
  messages: MemoryMessage[];
};
export type MessageGuard =
  | { kind: "current"; publicationId: string }
  | { kind: "comparison"; linkId: string; publicationId: string };
export type ConnectionKind = "voice" | "comparison";
export type ConnectionRequest = {
  id: string;
  kind: ConnectionKind;
  resourceId: string;
  status: "pending" | "complete" | "failed";
  expiresAt: string;
  createdAt: string;
};
export interface ConnectionStore {
  reserveDetailOutline(
    memoryId: string,
    versionId: string,
    requestId: string,
  ): Promise<void>;
  finishDetailOutline(
    memoryId: string,
    versionId: string,
    requestId: string,
    success: boolean,
  ): Promise<void>;
  publishSnapshot(
    memoryId: string,
    input: {
      versionId: string;
      caption: string;
      includeNarration: boolean;
      shareTokenHash: string;
    },
  ): Promise<PublicationSnapshot>;
  getPublication(id: string): Promise<PublicationSnapshot | null>;
  getVersionPins(memoryId: string, versionId: string): Promise<PinDraft[]>;
  saveVersionPins(
    memoryId: string,
    versionId: string,
    pins: PinDraft[],
  ): Promise<void>;
  saveNarration(narration: NarrationRecord): Promise<void>;
  getNarration(id: string): Promise<NarrationRecord | null>;
  narrations(memoryId: string): Promise<NarrationRecord[]>;
  putAudio(path: string, bytes: Uint8Array): Promise<void>;
  readAudio(path: string): Promise<Uint8Array>;
  removeAudio(path: string): Promise<void>;
  audioUrl(
    narration: NarrationRecord,
    capability?: { share?: string; comparison?: string },
  ): Promise<string>;
  reserveConnectionRequest(
    kind: ConnectionKind,
    resourceId: string,
    requestId: string,
    cap: number,
  ): Promise<"reserved" | "completed">;
  completeConnectionRequest(
    kind: ConnectionKind,
    resourceId: string,
    requestId: string,
    result: { transcript?: string; synthesis?: ComparisonSynthesis },
  ): Promise<void>;
  failConnectionRequest(
    kind: ConnectionKind,
    resourceId: string,
    requestId: string,
  ): Promise<void>;
  createOrGetPerspectiveLink(link: PerspectiveLink): Promise<PerspectiveLink>;
  getPerspectiveLink(id: string): Promise<PerspectiveLink | null>;
  findPerspectiveByInviteHash(hash: string): Promise<PerspectiveLink | null>;
  findPerspectiveByComparisonHash(
    hash: string,
  ): Promise<PerspectiveLink | null>;
  findPerspectiveByMemory(memoryId: string): Promise<PerspectiveLink | null>;
  claimPerspective(
    linkId: string,
    candidateMemory: MemoryRecord,
  ): Promise<string>;
  attachPerspectivePublication(
    linkId: string,
    memoryId: string,
    publicationId: string,
  ): Promise<void>;
  addPublishedMessage(
    message: MemoryMessage,
    guard: MessageGuard,
  ): Promise<void>;
}
// Used by the pin editor; the immutable approved scene remains on ImageVersion.
export type PinImage = Pick<ImageVersion, "id" | "scene">;
