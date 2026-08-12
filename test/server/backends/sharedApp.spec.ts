// @vitest-environment node
//
// The three shared-app operations, exercised end to end against an in-memory Firestore.
//
// What is pinned here is ORDER and OWNERSHIP, because those are what MulmoTerminal added and what
// nothing else checks. The projections are core's and are tested there; the failure this file
// exists to catch is a write landing in the wrong sequence — `apps/{aid}.public` is what the
// deployed rules read to authorize anonymous access, so a deploy that wrote it would open an app
// somebody was only testing, and a publish that wrote it FIRST would leave anonymous access live
// against a half-published surface if the next write failed.
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { setFirestoreAccessor, setSharedCollectionsSupport, type FirestoreDocs, type FirestoreDoc } from "@mulmoclaude/core/collection/server";
import { initCollectionsBackend } from "../../../server/backends/collections.js";
import { deploySharedApp } from "../../../server/backends/sharedApp/deploy.js";
import { publishSharedApp } from "../../../server/backends/sharedApp/publish.js";
import { unpublishSharedApp } from "../../../server/backends/sharedApp/unpublish.js";
import { makeTempDir } from "../../support/tempDir";

const AID = "app-under-test";
const OWNER = { uid: "uid-owner", email: "owner@example.com" };

/** An in-memory `FirestoreDocs` that REMEMBERS THE ORDER of writes. The order is the assertion in
 *  half this file, and a store that only kept final state would pass every one of these tests
 *  while the app opened before it had anything to show. */
class FakeDocs implements FirestoreDocs {
  readonly store = new Map<string, Map<string, Record<string, unknown>>>();
  readonly writes: string[] = [];
  /** Path/id whose next write throws — how a half-finished run is produced. */
  failAt: string | null = null;

  private bucket(collectionPath: string): Map<string, Record<string, unknown>> {
    const existing = this.store.get(collectionPath);
    if (existing) return existing;
    const created = new Map<string, Record<string, unknown>>();
    this.store.set(collectionPath, created);
    return created;
  }

  list = (collectionPath: string): Promise<FirestoreDoc[]> =>
    Promise.resolve([...this.bucket(collectionPath)].sort(([left], [right]) => (left < right ? -1 : 1)).map(([id, data]) => ({ id, data })));

  get = (collectionPath: string, docId: string): Promise<unknown | null> => Promise.resolve(this.bucket(collectionPath).get(docId) ?? null);

  set = (collectionPath: string, docId: string, data: Record<string, unknown>): Promise<void> => {
    const key = `${collectionPath}/${docId}`;
    if (this.failAt === key) return Promise.reject(new Error("permission-denied (test)"));
    this.writes.push(`set ${key}`);
    this.bucket(collectionPath).set(docId, structuredClone(data));
    return Promise.resolve();
  };

  create = (collectionPath: string, docId: string, data: Record<string, unknown>): Promise<boolean> => {
    if (this.bucket(collectionPath).has(docId)) return Promise.resolve(false);
    this.writes.push(`create ${collectionPath}/${docId}`);
    this.bucket(collectionPath).set(docId, structuredClone(data));
    return Promise.resolve(true);
  };

  delete = (collectionPath: string, docId: string): Promise<boolean> => {
    this.writes.push(`delete ${collectionPath}/${docId}`);
    return Promise.resolve(this.bucket(collectionPath).delete(docId));
  };

  watch = (): (() => void) => () => {};

  app = (): Record<string, unknown> | undefined => this.store.get("apps")?.get(AID);
  doc = (collectionPath: string, docId: string): Record<string, unknown> | undefined => this.store.get(collectionPath)?.get(docId);
}

let docs = new FakeDocs();

const schemaFor = (slug: string) => ({
  title: slug,
  icon: "star",
  primaryKey: "id",
  // Exactly one of dataPath / dataSource / storage — a shared collection's records are in the
  // app, so it declares the backend and no local path at all.
  storage: { type: "firestore" },
  fields: { id: { type: "string", label: "ID", primary: true, required: true }, note: { type: "string", label: "Note" } },
});

function writeCollection(root: string, slug: string): void {
  mkdirSync(path.join(root, ".claude", "skills", slug), { recursive: true });
  writeFileSync(path.join(root, ".claude", "skills", slug, "schema.json"), JSON.stringify(schemaFor(slug)));
}

function writeApp(root: string, app: Record<string, unknown>): void {
  writeFileSync(path.join(root, "app.json"), JSON.stringify(app));
}

/** A declaration with the roster the rules require: the publisher as owner of everything. */
const declaration = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  aid: AID,
  name: "App Under Test",
  members: { [OWNER.email]: { "*": "owner" } },
  ...extra,
});

const stamp = { now: () => 1_700_000_000_000, resolveCommit: () => Promise.resolve({ commit: "c0ffee", dirty: false }) };

let root = "";

describe("shared app deploy / publish / unpublish", () => {
  beforeAll(() => {
    // ONE binding per file — `configureCollectionHost` refuses a second call with a different host.
    initCollectionsBackend({ workspace: makeTempDir("mt-shared-app-ws-") });
    setSharedCollectionsSupport(true);
    setFirestoreAccessor(() => ({ docs, email: OWNER.email, uid: OWNER.uid }));
  });

  beforeEach(() => {
    docs = new FakeDocs();
    root = makeTempDir("mt-shared-app-");
    writeApp(root, declaration());
    writeCollection(root, "bookings");
  });

  it("deploys to the roster only — no public block, no published schema, no public config", async () => {
    const result = await deploySharedApp(root, stamp);
    expect(result.ok).toBe(true);
    // The one that matters: `publicOn` reads THIS field, not the world-readable projection, so a
    // deploy that wrote it would open the app for anyone testing.
    expect(docs.app()).not.toHaveProperty("public");
    expect(docs.app()?.memberEmails).toEqual([OWNER.email]);
    expect(docs.doc(`apps/${AID}/staging`, "bookings")).toMatchObject({ deployedBy: OWNER.email, deployedCommit: "c0ffee" });
    // The two documents the public page reads. Deploy must leave a LIVE app looking exactly as it did.
    expect(docs.store.get(`apps/${AID}/collections`)).toBeUndefined();
    expect(docs.store.get(`apps/${AID}/config`)).toBeUndefined();
  });

  it("writes the app document before the staged schemas — the staging rules resolve the owner through it", async () => {
    await deploySharedApp(root, stamp);
    expect(docs.writes).toEqual([`set apps/${AID}`, `set apps/${AID}/staging/bookings`]);
  });

  it("does not silently unpublish a live app when it is deployed again", async () => {
    writeApp(root, declaration({ public: { enabled: true, read: ["bookings"] } }));
    await deploySharedApp(root, stamp);
    await publishSharedApp(root, stamp);
    expect(docs.app()?.public).toMatchObject({ enabled: true });

    // The declaration is replaced, not merged — carrying `public` forward is what keeps a
    // replacement from revoking the publish.
    await deploySharedApp(root, stamp);
    expect(docs.app()?.public).toMatchObject({ enabled: true });
  });

  it("refuses to publish what was never staged", async () => {
    const result = await publishSharedApp(root, stamp);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.problems.join(" ")).toContain("nothing is staged");
    expect(result.ok === false && result.partial).toBe(false);
  });

  it("promotes the staged version and opens the app LAST", async () => {
    writeApp(root, declaration({ public: { enabled: true, read: ["bookings"] } }));
    await deploySharedApp(root, stamp);
    docs.writes.length = 0;

    const result = await publishSharedApp(root, stamp);
    expect(result.ok).toBe(true);
    expect(result.ok === true && result.publicOpen).toBe(true);
    // Promotion first, the projection next, and the authorization at the very end.
    expect(docs.writes).toEqual([`set apps/${AID}/collections/bookings`, `set apps/${AID}/config/public`, `set apps/${AID}`, `set apps/${AID}`]);
    expect(docs.doc(`apps/${AID}/collections`, "bookings")).toMatchObject({ publishedBy: OWNER.email });
    expect(docs.app()?.public).toMatchObject({ enabled: true });
  });

  it("leaves the app PRIVATE when a publish fails part-way", async () => {
    writeApp(root, declaration({ public: { enabled: true, read: ["bookings"] } }));
    await deploySharedApp(root, stamp);
    docs.failAt = `apps/${AID}/config/public`;

    const result = await publishSharedApp(root, stamp);
    expect(result.ok).toBe(false);
    // The whole point of the ordering: documents ARE live, and none of them grants anything.
    expect(result.ok === false && result.partial).toBe(true);
    expect(docs.app()).not.toHaveProperty("public");
    expect(result.ok === false && result.problems.join("\n")).toContain("Written by this publish, and live now");
  });

  it("publishes the STAGED version, not the working tree", async () => {
    await deploySharedApp(root, stamp);
    // The tree moves on after the deploy. Nobody has looked at this through /staging/{aid}.
    writeFileSync(
      path.join(root, ".claude", "skills", "bookings", "schema.json"),
      JSON.stringify({ ...schemaFor("bookings"), title: "Edited after the deploy" }),
    );
    await publishSharedApp(root, stamp);
    const published = docs.doc(`apps/${AID}/collections`, "bookings");
    expect((published?.publishedSchema as { title: string }).title).toBe("bookings");
  });

  it("withdraws a staged collection the repository no longer has", async () => {
    writeCollection(root, "waitlist");
    await deploySharedApp(root, stamp);
    expect(docs.doc(`apps/${AID}/staging`, "waitlist")).toBeDefined();

    // The directory is gone from the next deploy's point of view (discovery reads the tree).
    writeFileSync(path.join(root, ".claude", "skills", "waitlist", "schema.json"), "not json at all");
    const result = await deploySharedApp(root, stamp);
    expect(result.ok === true && result.withdrawn).toEqual(["waitlist"]);
    expect(docs.doc(`apps/${AID}/staging`, "waitlist")).toBeUndefined();
    // A withdrawal grants nothing, so it happens after the writes rather than before them.
    expect(docs.writes.at(-1)).toBe(`delete apps/${AID}/staging/waitlist`);
  });

  it("closes the app by removing the authorization first, and keeps the promoted schemas", async () => {
    writeApp(root, declaration({ public: { enabled: true, read: ["bookings"] } }));
    await deploySharedApp(root, stamp);
    await publishSharedApp(root, stamp);
    docs.writes.length = 0;

    const result = await unpublishSharedApp(root);
    expect(result.ok === true && result.wasOpen).toBe(true);
    expect(docs.writes).toEqual([`set apps/${AID}`, `delete apps/${AID}/config/public`]);
    expect(docs.app()).not.toHaveProperty("public");
    // Nobody can read them while the app is closed, so they cost nothing — and re-publishing is
    // then a promotion rather than a rebuild.
    expect(docs.doc(`apps/${AID}/collections`, "bookings")).toBeDefined();
  });

  it("stops at live records that would not fit the new schema, and confirming stages it anyway", async () => {
    docs.store.set(`apps/${AID}/collections/bookings/items`, new Map([["1", { id: "1" }]]));
    writeFileSync(
      path.join(root, ".claude", "skills", "bookings", "schema.json"),
      JSON.stringify({ ...schemaFor("bookings"), fields: { ...schemaFor("bookings").fields, note: { type: "string", label: "Note", required: true } } }),
    );

    const refused = await deploySharedApp(root, stamp);
    expect(refused.ok).toBe(false);
    expect(refused.ok === false && refused.problems.join("\n")).toContain("would not satisfy the schema");
    expect(docs.app()).toBeUndefined();

    const confirmed = await deploySharedApp(root, { ...stamp, confirm: true });
    expect(confirmed.ok === true && confirmed.recordIssues).toBe(1);
  });

  it("does not let a confirmed deploy buy the publish", async () => {
    // The reason the scan runs at BOTH boundaries: deploy's confirm says "let me stage this
    // anyway", which mid-migration is the useful thing. It is not the same sentence as "let
    // everyone have it", so publish asks again and needs its own confirm.
    docs.store.set(`apps/${AID}/collections/bookings/items`, new Map([["1", { id: "1" }]]));
    writeFileSync(
      path.join(root, ".claude", "skills", "bookings", "schema.json"),
      JSON.stringify({ ...schemaFor("bookings"), fields: { ...schemaFor("bookings").fields, note: { type: "string", label: "Note", required: true } } }),
    );
    await deploySharedApp(root, { ...stamp, confirm: true });

    const refused = await publishSharedApp(root, stamp);
    expect(refused.ok).toBe(false);
    expect(refused.ok === false && refused.problems.join("\n")).toContain("not inherited");
    expect(docs.store.get(`apps/${AID}/collections`)?.get("bookings")).toBeUndefined();

    const confirmed = await publishSharedApp(root, { ...stamp, confirm: true });
    expect(confirmed.ok).toBe(true);
  });

  it("says so rather than reporting success when there was nothing open to close", async () => {
    await deploySharedApp(root, stamp);
    const result = await unpublishSharedApp(root);
    expect(result.ok === true && result.wasOpen).toBe(false);
  });
});
