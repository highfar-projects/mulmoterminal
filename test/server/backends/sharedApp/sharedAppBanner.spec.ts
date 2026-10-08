// @vitest-environment node
//
// The theme's banner at publish (receptron/mulmoserver#336): read from the repository, checked to be
// the picture its name says, written to `config/banner` while the app is public, and removed otherwise.
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { setFirestoreAccessor, setSharedCollectionsSupport, type FirestoreDocs, type FirestoreDoc } from "@mulmoclaude/core/collection/server";
import { BANNER_MAX_BYTES } from "@receptron/sharedapp";
import { initCollectionsBackend } from "../../../../server/backends/collections/collections.js";
import { publishSharedApp } from "../../../../server/backends/sharedApp/publish.js";
import { unpublishSharedApp } from "../../../../server/backends/sharedApp/unpublish.js";
import { bannerKindOf } from "../../../../server/backends/sharedApp/bannerWrites.js";
import { makeTempDir } from "../../../support/tempDir";
import { fakeServerTimestamp } from "../../../support/serverTimestamp.js";

const AID = "app-banner";
const OWNER = { uid: "uid-owner", email: "owner@example.com" };
const CONFIG = `apps/${AID}/config`;
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>');

/** The store publish writes through. `apps/{aid}` is unreadable until it exists, as under the rules. */
class FakeDocs implements FirestoreDocs {
  timestamp = fakeServerTimestamp;
  readonly store = new Map<string, Map<string, Record<string, unknown>>>();
  private bucket(collectionPath: string): Map<string, Record<string, unknown>> {
    const existing = this.store.get(collectionPath) ?? new Map<string, Record<string, unknown>>();
    this.store.set(collectionPath, existing);
    return existing;
  }
  list = (collectionPath: string): Promise<FirestoreDoc[]> => Promise.resolve([...this.bucket(collectionPath)].map(([id, data]) => ({ id, data })));
  get = (collectionPath: string, docId: string): Promise<unknown | null> => {
    const existing = this.bucket(collectionPath).get(docId);
    if (collectionPath === "apps" && !existing) return Promise.reject(Object.assign(new Error("read refused (test)"), { code: "permission-denied" }));
    return Promise.resolve(existing ?? null);
  };
  set = (collectionPath: string, docId: string, data: Record<string, unknown>): Promise<void> => {
    this.bucket(collectionPath).set(docId, structuredClone(data));
    return Promise.resolve();
  };
  create = (collectionPath: string, docId: string, data: Record<string, unknown>): Promise<boolean> => {
    if (this.bucket(collectionPath).has(docId)) return Promise.resolve(false);
    this.bucket(collectionPath).set(docId, structuredClone(data));
    return Promise.resolve(true);
  };
  delete = (collectionPath: string, docId: string): Promise<boolean> => Promise.resolve(this.bucket(collectionPath).delete(docId));
  watch = (): (() => void) => () => {};
  doc = (collectionPath: string, docId: string): Record<string, unknown> | undefined => this.store.get(collectionPath)?.get(docId);
}

let docs = new FakeDocs();
let root = "";

const declaration = (theme: Record<string, unknown> | undefined, isPublic = true): Record<string, unknown> => ({
  aid: AID,
  name: "Banner",
  members: { [OWNER.email]: { "*": "owner" } },
  ...(theme === undefined ? {} : { theme }),
  ...(isPublic ? { public: { enabled: true, read: [] } } : {}),
});
const writeApp = (app: Record<string, unknown>): void => writeFileSync(path.join(root, "app.json"), JSON.stringify(app));
const stamp = { now: () => 1_700_000_000_000, resolveCommit: () => Promise.resolve({ commit: "c0ffee", dirty: false }) };

describe("bannerKindOf", () => {
  it("reads the kind from the bytes, not the name", () => {
    expect(bannerKindOf(PNG)).toBe("image/png");
    expect(bannerKindOf(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(bannerKindOf(Buffer.from("RIFF\0\0\0\0WEBPVP8 "))).toBe("image/webp");
    expect(bannerKindOf(SVG)).toBe("image/svg+xml");
    expect(bannerKindOf(Buffer.from('<?xml version="1.0"?>\n<svg/>'))).toBe("image/svg+xml");
    expect(bannerKindOf(Buffer.from("<html><body>x</body></html>"))).toBeNull();
    expect(bannerKindOf(Buffer.from("plain text"))).toBeNull();
  });
});

describe("the banner at publish", () => {
  beforeAll(() => {
    initCollectionsBackend({ workspace: makeTempDir("mt-banner-ws-") });
    setSharedCollectionsSupport(true);
    setFirestoreAccessor(() => ({ docs, email: OWNER.email, uid: OWNER.uid }));
  });

  beforeEach(() => {
    docs = new FakeDocs();
    root = makeTempDir("mt-banner-");
    mkdirSync(path.join(root, "views"), { recursive: true });
    writeFileSync(path.join(root, "views", "banner.png"), PNG);
    writeFileSync(path.join(root, "views", "banner.svg"), SVG);
  });

  it("writes the picture, base64 and typed, while the app is public", async () => {
    writeApp(declaration({ banner: "views/banner.svg" }));
    expect((await publishSharedApp(root, stamp)).ok).toBe(true);
    expect(docs.doc(CONFIG, "banner")).toMatchObject({ contentType: "image/svg+xml", data: SVG.toString("base64") });
  });

  it("refuses a file whose contents are not the picture its name says, writing nothing", async () => {
    writeFileSync(path.join(root, "views", "fake.png"), "<html>not a png</html>");
    writeApp(declaration({ banner: "views/fake.png" }));
    const result = await publishSharedApp(root, stamp);
    expect(result.ok).toBe(false);
    expect(docs.doc(CONFIG, "banner")).toBeUndefined();
  });

  it("refuses a banner over the size limit before reading it", async () => {
    writeFileSync(path.join(root, "views", "big.png"), Buffer.concat([PNG, Buffer.alloc(BANNER_MAX_BYTES)]));
    writeApp(declaration({ banner: "views/big.png" }));
    expect((await publishSharedApp(root, stamp)).ok).toBe(false);
  });

  it("removes the banner when the theme stops naming one, or the app is not public", async () => {
    writeApp(declaration({ banner: "views/banner.png" }));
    await publishSharedApp(root, stamp);
    expect(docs.doc(CONFIG, "banner")).toBeDefined();
    writeApp(declaration({ ticker: "x" }));
    await publishSharedApp(root, stamp);
    expect(docs.doc(CONFIG, "banner")).toBeUndefined();
    writeApp(declaration({ banner: "views/banner.png" }, false));
    await publishSharedApp(root, stamp);
    expect(docs.doc(CONFIG, "banner")).toBeUndefined();
  });

  it("unpublish takes the banner down", async () => {
    writeApp(declaration({ banner: "views/banner.png" }));
    await publishSharedApp(root, stamp);
    expect((await unpublishSharedApp(root)).ok).toBe(true);
    expect(docs.doc(CONFIG, "banner")).toBeUndefined();
  });

  it("closing the app removes the banner even when the file it names is broken", async () => {
    writeApp(declaration({ banner: "views/banner.png" }));
    await publishSharedApp(root, stamp);
    writeApp(declaration({ banner: "views/missing.png" }, false));
    expect((await publishSharedApp(root, stamp)).ok).toBe(true);
    expect(docs.doc(CONFIG, "banner")).toBeUndefined();
  });
});
