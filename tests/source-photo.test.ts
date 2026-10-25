import { expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import sharp from "sharp";
import { createLocalStore } from "@/lib/server/local-store";
import { SourcePhotoService } from "@/lib/server/source-photo";
import { hashToken } from "@/lib/server/access";
it("preserves originals, strips display metadata, replays completion and rejects a second source", async () => {
  const dir = await mkdtemp(`${tmpdir()}/source-test-`);
  try {
    const store = createLocalStore(dir);
    await store.createMemory({
      id: "m",
      authorTokenHash: hashToken("owner"),
      title: "",
      authorName: "",
      recipientName: "",
      story: "",
      scenePlan: null,
      shareTokenHash: null,
      publishedVersionId: null,
      publishedCaption: "",
      publishedTitle: "",
      publishedAuthorName: "",
      publishedRecipientName: "",
      createdAt: new Date().toISOString(),
    });
    const service = new SourcePhotoService(store),
      auth = { memoryId: "m", ownerToken: "owner" };
    await expect(
      service.initiate(
        { ...auth, ownerToken: "wrong" },
        { name: "a.png", mimeType: "image/png", size: 10 },
      ),
    ).rejects.toMatchObject({ status: 403 });
    const bytes = await sharp({
      create: { width: 32, height: 20, channels: 3, background: "red" },
    })
      .withMetadata()
      .png()
      .toBuffer();
    const first = await service.initiate(auth, {
      name: "a.png",
      mimeType: "image/png",
      size: bytes.length,
    });
    const second = await service.initiate(auth, {
      name: "b.png",
      mimeType: "image/png",
      size: bytes.length,
    });
    await service.upload(auth, first.uploadId, bytes);
    await service.upload(auth, second.uploadId, bytes);
    const version = await service.complete(auth, first.uploadId);
    expect(version.origin).toBe("source");
    expect((await service.complete(auth, first.uploadId)).id).toBe(version.id);
    await expect(service.complete(auth, second.uploadId)).rejects.toMatchObject(
      { status: 409 },
    );
    const source = await store.getSourcePhoto("m");
    expect(
      Buffer.from((await store.readSource(source!.originalPath)).bytes),
    ).toEqual(bytes);
    expect(
      (await sharp((await service.getDisplay(auth)).bytes).metadata()).exif,
    ).toBeUndefined();
    expect(await store.versions("m")).toHaveLength(1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

async function fixture() {
  const dir = await mkdtemp(`${tmpdir()}/source-test-`);
  const store = createLocalStore(dir);
  await store.createMemory({
    id: "m",
    authorTokenHash: hashToken("owner"),
    title: "",
    authorName: "",
    recipientName: "",
    story: "",
    scenePlan: null,
    shareTokenHash: null,
    publishedVersionId: null,
    publishedCaption: "",
    publishedTitle: "",
    publishedAuthorName: "",
    publishedRecipientName: "",
    createdAt: new Date().toISOString(),
  });
  const auth = { memoryId: "m", ownerToken: "owner" };
  return { dir, store, auth, service: new SourcePhotoService(store) };
}
it("authorizes complete and display before storage and rejects unsupported declarations", async () => {
  const f = await fixture();
  try {
    await expect(
      f.service.complete({ ...f.auth, ownerToken: "wrong" }, "foreign"),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      f.service.getDisplay({ ...f.auth, ownerToken: "wrong" }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      f.service.initiate(f.auth, {
        name: "x.gif",
        mimeType: "image/gif",
        size: 3,
      }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      f.service.initiate(f.auth, {
        name: "x.png",
        mimeType: "image/png",
        size: 12582913,
      }),
    ).rejects.toMatchObject({ status: 413 });
  } finally {
    await rm(f.dir, { recursive: true, force: true });
  }
});
it("rejects mismatched MIME and incomplete bytes without changing the memory", async () => {
  const f = await fixture();
  try {
    const bytes = await sharp({
      create: { width: 8, height: 8, channels: 3, background: "white" },
    })
      .png()
      .toBuffer();
    const u = await f.service.initiate(f.auth, {
      name: "x.jpg",
      mimeType: "image/jpeg",
      size: bytes.length,
    });
    await f.service.upload(f.auth, u.uploadId, bytes);
    await expect(f.service.complete(f.auth, u.uploadId)).rejects.toMatchObject({
      status: 400,
    });
    const v = await f.service.initiate(f.auth, {
      name: "bad.png",
      mimeType: "image/png",
      size: 3,
    });
    await f.service.upload(f.auth, v.uploadId, new Uint8Array([1, 2, 3]));
    await expect(f.service.complete(f.auth, v.uploadId)).rejects.toMatchObject({
      status: 400,
    });
    expect(await f.store.versions("m")).toEqual([]);
  } finally {
    await rm(f.dir, { recursive: true, force: true });
  }
});
it("serializes simultaneous source adoption and never deletes the winner", async () => {
  const f = await fixture();
  try {
    const bytes = await sharp({
      create: { width: 8, height: 8, channels: 3, background: "white" },
    })
      .png()
      .toBuffer();
    const ids = await Promise.all(
      [1, 2].map(async () => {
        const u = await f.service.initiate(f.auth, {
          name: "x.png",
          mimeType: "image/png",
          size: bytes.length,
        });
        await f.service.upload(f.auth, u.uploadId, bytes);
        return u.uploadId;
      }),
    );
    const results = await Promise.allSettled(
      ids.map((id) => f.service.complete(f.auth, id)),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await f.store.versions("m")).toHaveLength(1);
    expect((await f.service.getDisplay(f.auth)).bytes.length).toBeGreaterThan(
      0,
    );
  } finally {
    await rm(f.dir, { recursive: true, force: true });
  }
});
it("reuses a written display after metadata failure and retains immutable original", async () => {
  const f = await fixture();
  try {
    const bytes = await sharp({
      create: { width: 30, height: 20, channels: 3, background: "white" },
    })
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer();
    const u = await f.service.initiate(f.auth, {
      name: "x.jpg",
      mimeType: "image/jpeg",
      size: bytes.length,
    });
    await f.service.upload(f.auth, u.uploadId, bytes);
    const finish = f.store.finishSourceUpload;
    let failed = false;
    f.store.finishSourceUpload = async (...args) => {
      if (!failed) {
        failed = true;
        throw new Error("temporary metadata failure");
      }
      return finish(...args);
    };
    await expect(f.service.complete(f.auth, u.uploadId)).rejects.toThrow(
      "temporary metadata failure",
    );
    const version = await f.service.complete(f.auth, u.uploadId);
    const metadata = await sharp(
      (await f.store.readImage(version.imagePath)).bytes,
    ).metadata();
    expect([metadata.width, metadata.height]).toEqual([20, 30]);
    expect(metadata.exif).toBeUndefined();
    const source = await f.store.getSourcePhoto("m");
    expect(source!.sha256).toMatch(/^[a-f0-9]{64}$/);
    await expect(
      f.service.upload(f.auth, u.uploadId, bytes),
    ).rejects.toMatchObject({ status: 409 });
  } finally {
    await rm(f.dir, { recursive: true, force: true });
  }
});
it("rejects an expired abandoned upload and an oversized raster", async () => {
  const f = await fixture();
  try {
    await f.store.createSourceUpload({
      id: "old",
      memoryId: "m",
      originalPath: "m/old/original",
      mimeType: "image/png",
      size: 1,
      status: "pending",
      expiresAt: Date.now() - 1,
    });
    await expect(f.service.complete(f.auth, "old")).rejects.toMatchObject({
      status: 409,
    });
    const bytes = await sharp({
      create: { width: 5000, height: 5000, channels: 3, background: "white" },
    })
      .png()
      .toBuffer();
    const u = await f.service.initiate(f.auth, {
      name: "huge.png",
      mimeType: "image/png",
      size: bytes.length,
    });
    await f.service.upload(f.auth, u.uploadId, bytes);
    await expect(f.service.complete(f.auth, u.uploadId)).rejects.toMatchObject({
      status: 400,
    });
  } finally {
    await rm(f.dir, { recursive: true, force: true });
  }
});
it("cleans only expired unadopted assets after a grace period", async () => {
  const f = await fixture();
  try {
    const old = {
      id: "expired",
      memoryId: "m",
      originalPath: "m/expired/original",
      mimeType: "image/png",
      size: 1,
      status: "pending" as const,
      expiresAt: Date.now() - 25 * 3600000,
    };
    await f.store.createSourceUpload(old);
    await f.store.putSource(old.originalPath, {
      bytes: new Uint8Array([1]),
      mimeType: "image/png",
    });
    await f.service.cleanup(f.auth);
    await expect(f.store.readSource(old.originalPath)).rejects.toThrow();
    const fresh = {
      ...old,
      id: "fresh",
      originalPath: "m/fresh/original",
      expiresAt: Date.now() - 1000,
    };
    await f.store.createSourceUpload(fresh);
    await f.store.putSource(fresh.originalPath, {
      bytes: new Uint8Array([1]),
      mimeType: "image/png",
    });
    await f.service.cleanup(f.auth);
    expect((await f.store.readSource(fresh.originalPath)).bytes).toHaveLength(
      1,
    );
  } finally {
    await rm(f.dir, { recursive: true, force: true });
  }
});
it("allows an expired completion claim to resume but rejects a stale finisher", async () => {
  const f = await fixture();
  try {
    await f.store.createSourceUpload({
      id: "lease",
      memoryId: "m",
      originalPath: "m/lease/original",
      mimeType: "image/png",
      size: 1,
      status: "validating",
      expiresAt: Date.now() + 3600000,
      claimId: "old",
      claimExpiresAt: Date.now() - 1,
    });
    expect((await f.store.claimSourceUpload("m", "lease", "new")).claimId).toBe(
      "new",
    );
    await expect(
      f.store.claimSourceUpload("m", "lease", "other"),
    ).rejects.toMatchObject({ status: 409 });
    await f.store.failSourceUpload("m", "lease", "old");
    expect((await f.store.getSourceUpload("m", "lease"))!.status).toBe(
      "validating",
    );
  } finally {
    await rm(f.dir, { recursive: true, force: true });
  }
});
it("rejects animation rather than silently preserving only its first frame", async () => {
  const f = await fixture();
  try {
    const bytes = await sharp(
      Buffer.concat([Buffer.alloc(8 * 8 * 3, 255), Buffer.alloc(8 * 8 * 3, 0)]),
      { raw: { width: 8, height: 16, pageHeight: 8, channels: 3 } },
    )
      .webp({ loop: 0, delay: [100, 100] })
      .toBuffer();
    expect((await sharp(bytes, { animated: true }).metadata()).pages).toBe(2);
    const u = await f.service.initiate(f.auth, {
      name: "motion.webp",
      mimeType: "image/webp",
      size: bytes.length,
    });
    await f.service.upload(f.auth, u.uploadId, bytes);
    await expect(f.service.complete(f.auth, u.uploadId)).rejects.toMatchObject({
      status: 400,
    });
    expect(await f.store.getSourcePhoto("m")).toBeNull();
  } finally {
    await rm(f.dir, { recursive: true, force: true });
  }
});

it("accepts an empty201 response when Supabase creates an upload record", async () => {
  const { createSourcePhotoSupabaseStore } = await import(
    "@/lib/server/source-photo-supabase-store"
  );
  const old = globalThis.fetch;
  globalThis.fetch = async () => new Response(null, { status: 201 });
  try {
    await expect(
      createSourcePhotoSupabaseStore(
        "https://example.supabase.co",
        "test-key",
      ).createSourceUpload({
        id: "id",
        memoryId: "memory",
        originalPath: "memory/id/original",
        mimeType: "image/png",
        size: 100,
        status: "pending",
        expiresAt: Date.now() + 1000,
      }),
    ).resolves.toBeUndefined();
  } finally {
    globalThis.fetch = old;
  }
});
