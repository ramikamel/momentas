import { expect, it, vi } from "vitest";
import sharp from "sharp";
import {
  ReferenceService,
  referenceForm,
  referenceView,
  REFERENCE_UPLOAD_LIMIT,
} from "../src/lib/server/references";
import { hashToken } from "../src/lib/server/access";
import type { Store } from "../src/lib/memory/types";
import type { MemoryReference } from "../src/lib/memory/personalization";
const auth = {
  memoryId: "12345678-1234-1234-1234-123456789012",
  ownerToken: "owner",
};
function fake(records: MemoryReference[] = []) {
  return {
    getMemory: vi.fn(async () => ({ authorTokenHash: hashToken("owner") })),
    references: vi.fn(async () => records),
    putImage: vi.fn(async () => {}),
    saveReference: vi.fn(async () => {}),
    removeImage: vi.fn(async () => {}),
    deleteReference: vi.fn(async () => {}),
    readImage: vi.fn(async () => ({
      bytes: new Uint8Array(),
      mimeType: "image/webp",
    })),
  };
}
const record: MemoryReference = {
  id: "r",
  memoryId: auth.memoryId,
  label: "Dad",
  kind: "person",
  imagePath: "private-path",
  createdAt: "now",
};
async function photo() {
  return new File(
    [
      await sharp({
        create: { width: 20, height: 10, channels: 3, background: "red" },
      })
        .png()
        .toBuffer(),
    ],
    "photo.png",
    { type: "image/png" },
  );
}
it("checks ownership before reading private reference metadata or image", async () => {
  const store = fake([record]);
  const service = new ReferenceService(store as unknown as Store);
  const denied = { ...auth, ownerToken: "wrong" };
  await expect(service.list(denied)).rejects.toMatchObject({ status: 403 });
  await expect(service.image(denied, record.id)).rejects.toMatchObject({
    status: 403,
  });
  await expect(service.remove(denied, record.id)).rejects.toMatchObject({
    status: 403,
  });
  expect(store.references).not.toHaveBeenCalled();
  expect(store.readImage).not.toHaveBeenCalled();
});
it("returns owner route URLs without storage paths", () => {
  const view = referenceView(record);
  expect(view).not.toHaveProperty("imagePath");
  expect(view.imageUrl).toBe(
    `/api/memories/${auth.memoryId}/references/r/image`,
  );
});
it("validates actual image bytes, names, kinds, and count before storage", async () => {
  const store = fake();
  const service = new ReferenceService(store as unknown as Store);
  await expect(
    service.upload(
      auth,
      new File(["<svg/>"], "fake.png", { type: "image/png" }),
      "Dad",
      "person",
    ),
  ).rejects.toThrow("valid JPEG");
  await expect(
    service.upload(auth, await photo(), " ", "person"),
  ).rejects.toThrow("Name this photo");
  await expect(
    service.upload(auth, await photo(), "Dad", "url"),
  ).rejects.toThrow("Choose person");
  store.references.mockResolvedValue([record]);
  await expect(
    service.upload(auth, await photo(), " dad ", "person"),
  ).rejects.toThrow("different name");
  store.references.mockResolvedValue([record, record, record, record]);
  await expect(
    service.upload(auth, await photo(), "Kitchen", "place"),
  ).rejects.toThrow("four");
  expect(store.putImage).not.toHaveBeenCalled();
});
it("reencodes to WebP, gives server filenames, and cleans up rejected metadata writes", async () => {
  const store = fake();
  store.saveReference.mockRejectedValueOnce(new Error("atomic limit"));
  await expect(
    new ReferenceService(store as unknown as Store).upload(
      auth,
      await photo(),
      " Dad ",
      "person",
    ),
  ).rejects.toThrow("atomic limit");
  expect(store.putImage).toHaveBeenCalledOnce();
  const [path, image] = store.putImage.mock.calls[0] as unknown as [
    string,
    { bytes: Uint8Array; mimeType: string },
  ];
  expect(path).toMatch(
    new RegExp(`^${auth.memoryId}/references/[a-f0-9-]+\\.webp$`),
  );
  expect(image.mimeType).toBe("image/webp");
  expect((await sharp(image.bytes).metadata()).format).toBe("webp");
  expect(store.removeImage).toHaveBeenCalledWith(path);
});
it("removes private metadata before the image object", async () => {
  const store = fake([record]);
  await new ReferenceService(store as unknown as Store).remove(auth, record.id);
  expect(store.deleteReference.mock.invocationCallOrder[0]).toBeLessThan(
    store.removeImage.mock.invocationCallOrder[0],
  );
});
it("bounds multipart bytes even when content length is absent", async () => {
  const request = new Request("http://localhost/upload", {
    method: "POST",
    headers: { "content-type": "multipart/form-data; boundary=x" },
    body: new Uint8Array(REFERENCE_UPLOAD_LIMIT + 1),
  });
  await expect(referenceForm(request)).rejects.toMatchObject({ status: 413 });
});
