import type { PublicPin } from "./connections";
export type MemoryReference = {
  id: string;
  memoryId: string;
  label: string;
  kind: "person" | "place" | "object";
  imagePath: string;
  createdAt: string;
};
export type ReferenceView = Omit<MemoryReference, "imagePath"> & {
  imageUrl: string;
};
export type DetectedObject = {
  id: string;
  label: string;
  x: number;
  y: number;
  area: number;
  outline: NonNullable<PublicPin["outline"]>;
};
export type ObjectMap = {
  memoryId: string;
  versionId: string;
  status: "pending" | "complete" | "failed";
  objects: DetectedObject[];
  updatedAt: string;
};
export interface PersonalizationStore {
  references(memoryId: string): Promise<MemoryReference[]>;
  saveReference(reference: MemoryReference): Promise<void>;
  deleteReference(memoryId: string, referenceId: string): Promise<void>;
  getObjectMap(memoryId: string, versionId: string): Promise<ObjectMap | null>;
  claimObjectMap(
    memoryId: string,
    versionId: string,
    requestId: string,
    retry: boolean,
  ): Promise<{ claimed: boolean; map: ObjectMap }>;
  saveObjectMap(
    memoryId: string,
    versionId: string,
    requestId: string,
    objects: DetectedObject[],
    status: "complete" | "failed",
  ): Promise<void>;
  reserveOutlineBatch(
    memoryId: string,
    versionId: string,
    requestIds: string[],
  ): Promise<void>;
}
