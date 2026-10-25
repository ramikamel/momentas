import type { GeneratedImage, ImageVersion } from "./types";
export type SourcePhoto = {
  id: string;
  memoryId: string;
  versionId: string;
  originalPath: string;
  displayPath: string;
  mimeType: string;
  sha256: string;
  width: number;
  height: number;
};
export type SourceUpload = {
  id: string;
  memoryId: string;
  originalPath: string;
  mimeType: string;
  size: number;
  status: "pending" | "validating" | "ready" | "failed";
  expiresAt: number;
  claimId?: string;
  claimExpiresAt?: number;
  source?: SourcePhoto;
  version?: ImageVersion;
};
export type SourcePhotoStore = {
  expiredSourceUploads(mid: string, before: number): Promise<SourceUpload[]>;
  removeSource(path: string): Promise<void>;
  createSourceUpload(upload: SourceUpload): Promise<void>;
  getSourceUpload(mid: string, id: string): Promise<SourceUpload | null>;
  claimSourceUpload(
    mid: string,
    id: string,
    claimId: string,
  ): Promise<SourceUpload>;
  finishSourceUpload(
    mid: string,
    id: string,
    claimId: string,
    source: SourcePhoto,
    version: ImageVersion,
  ): Promise<ImageVersion>;
  failSourceUpload(mid: string, id: string, claimId: string): Promise<void>;
  getSourcePhoto(mid: string): Promise<SourcePhoto | null>;
  sourceUploadUrl(
    upload: SourceUpload,
  ): Promise<{
    uploadUrl: string;
    method: string;
    headers: Record<string, string>;
  }>;
  putSource(path: string, image: GeneratedImage): Promise<void>;
  readSource(path: string): Promise<GeneratedImage>;
};
