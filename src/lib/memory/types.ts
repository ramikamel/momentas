export type SourcedDetail = { text: string; sourceQuote: string };
export type ScenePlan = {
  setting: SourcedDetail | null;
  people: SourcedDetail[];
  details: SourcedDetail[];
  perspective: SourcedDetail | null;
  feelings: SourcedDetail[];
  followUpQuestions: string[];
};
export type ApprovedScene = {
  plan: ScenePlan;
  authorAdditions: string;
  confirmed: true;
};
export type DraftInput = {
  title: string;
  authorName: string;
  recipientName: string;
  story: string;
  scenePlan: ScenePlan | null;
};
export type ImageVersion = {
  id: string;
  memoryId: string;
  parentVersionId: string | null;
  imagePath: string;
  scene: ApprovedScene;
  instruction: string | null;
  createdAt: string;
};
export type MemoryMessage = {
  id: string;
  memoryId: string;
  versionId: string;
  role: "recipient" | "storyteller";
  displayName: string;
  text: string;
  parentId: string | null;
  createdAt: string;
};
export type GeneratedImage = { bytes: Uint8Array; mimeType: string };
export type RenderInput = {
  requestId: string;
  scene: ApprovedScene;
  baseVersionId: string | null;
  instruction: string | null;
};
export type MemoryRecord = DraftInput & {
  id: string;
  authorTokenHash: string;
  shareTokenHash: string | null;
  publishedVersionId: string | null;
  publishedCaption: string;
  publishedTitle: string;
  publishedAuthorName: string;
  publishedRecipientName: string;
  createdAt: string;
};
export type ImageVersionView = ImageVersion & { imageUrl: string };
export type AuthorMemoryView = DraftInput & {
  id: string;
  createdAt: string;
  versions: ImageVersionView[];
  messages: MemoryMessage[];
  publishedVersionId: string | null;
  publishedCaption: string;
  shareUrl: string | null;
};
export type PublishedMemoryView = {
  title: string;
  authorName: string;
  recipientName: string;
  caption: string;
  versionId: string;
  imageUrl: string;
  imageDescription: string;
  messages: MemoryMessage[];
};
export type RenderRequest = {
  id: string;
  memoryId: string;
  status: "pending" | "complete" | "failed";
  createdAt: string;
  expiresAt: string;
  versionId: string | null;
};
export type RenderReservation =
  { kind: "reserved" } | { kind: "completed"; version: ImageVersion };
export type Store = {
  createMemory(memory: MemoryRecord): Promise<void>;
  getMemory(id: string): Promise<MemoryRecord | null>;
  updateMemory(id: string, update: Partial<MemoryRecord>): Promise<void>;
  findShared(hash: string): Promise<MemoryRecord | null>;
  versions(memoryId: string): Promise<ImageVersion[]>;
  messages(memoryId: string): Promise<MemoryMessage[]>;
  addMessage(
    message: MemoryMessage,
    expectedPublishedVersion?: string,
  ): Promise<void>;
  reserveRender(
    memoryId: string,
    requestId: string,
    cap: number,
  ): Promise<RenderReservation>;
  completeRender(
    memoryId: string,
    requestId: string,
    version: ImageVersion,
  ): Promise<void>;
  failRender(memoryId: string, requestId: string): Promise<void>;
  putImage(path: string, image: GeneratedImage): Promise<void>;
  readImage(path: string): Promise<GeneratedImage>;
  removeImage(path: string): Promise<void>;
  imageUrl(
    path: string,
    memoryId: string,
    versionId: string,
    shareToken?: string,
  ): Promise<string>;
};
