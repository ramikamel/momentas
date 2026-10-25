import type { PublicPin } from "./connections";
export type PhotoQuestion = { id: string; text: string; regionId?: string };
export type PhotoQuestions = {
  status: "pending" | "complete" | "failed";
  questions: PhotoQuestion[];
  requestId: string;
  expiresAt: number;
};
export type PhotoContextDraft = {
  key: string;
  revision: number;
  text: string;
  questionIndex: number;
  region?: Pick<PublicPin, "x" | "y" | "outline">;
  narrationId?: string;
  pendingNarrationId?: string;
  appliedNarrations: string[];
};
export type PhotoContextInput = Omit<PhotoContextDraft, "appliedNarrations"> & {
  transcript?: string;
  recordingId?: string;
};
export interface PhotoContextStore {
  photoContexts(mid: string, vid: string): Promise<PhotoContextDraft[]>;
  savePhotoContext(
    mid: string,
    vid: string,
    input: PhotoContextInput,
  ): Promise<PhotoContextDraft>;
  getPhotoQuestions(mid: string, vid: string): Promise<PhotoQuestions | null>;
  claimPhotoQuestions(
    mid: string,
    vid: string,
    rid: string,
    retry: boolean,
  ): Promise<boolean>;
  finishPhotoQuestions(
    mid: string,
    vid: string,
    rid: string,
    questions: PhotoQuestion[],
    failed: boolean,
  ): Promise<void>;
}
