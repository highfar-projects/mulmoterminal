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
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
    // The one rule this fake models, because a caller DEPENDS on being refused: `appSlugs`'
    // update rule pins `aid`, so a write naming a different app is rejected. That refusal is how
    // the reservation code asks "is this name ours?" about a document it may not read.
    const existing = this.bucket(collectionPath).get(docId);
    if (collectionPath === "appSlugs" && existing && existing.aid !== data.aid) {
      return Promise.reject(new Error("permission-denied: appSlugs.aid is immutable (test)"));
    }
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

  it("refuses to publish a staging set that is missing a collection the repository has", async () => {
    // Not the same question as "is staging empty". A deploy writes the staged documents one at a
    // time, so one that failed part-way leaves a NONEMPTY but incomplete set — and publishing it
    // opens an app whose declaration names a collection with no schema behind it.
    await deploySharedApp(root, stamp);
    writeCollection(root, "waitlist");

    const result = await publishSharedApp(root, stamp);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.problems.join("\n")).toContain("waitlist");
    expect(docs.store.get(`apps/${AID}/collections`)).toBeUndefined();

    // Deploying is the fix, and it is the same fix for the ordinary version of this: a collection
    // added to the repository and never deployed.
    await deploySharedApp(root, stamp);
    expect((await publishSharedApp(root, stamp)).ok).toBe(true);
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

  it("reserves the declared URL name at deploy, and records it where it can be read back", async () => {
    writeApp(root, declaration({ slug: "sakura-hair" }));
    const result = await deploySharedApp(root, stamp);
    expect(result.ok === true && result.slug).toBe("sakura-hair");
    // `published: false` — the reservation exists and nobody can resolve it yet, which is what
    // keeps /staging/{aid} unguessable while the roster tests the app.
    expect(docs.doc("appSlugs", "sakura-hair")).toEqual({ aid: AID, published: false });
    // On the app document, because appSlugs is unreadable until publish: this is the only place
    // "which name do we hold?" can be asked from.
    expect(docs.app()?.slug).toBe("sakura-hair");
  });

  it("does not reserve a SECOND name when the same app is deployed again", async () => {
    writeApp(root, declaration({ slug: "sakura-hair" }));
    await deploySharedApp(root, stamp);
    docs.writes.length = 0;

    const again = await deploySharedApp(root, stamp);
    expect(again.ok === true && again.slug).toBe("sakura-hair");
    // A URL is a thing people have already sent to each other (D2b). Re-reserving would hand the
    // app `sakura-hair-2` on every deploy, and the reservation cannot be read back to notice.
    expect(docs.writes.filter((write) => write.includes("appSlugs"))).toEqual([]);
  });

  it("takes the next numbering when the wanted name is held by someone else", async () => {
    docs.store.set("appSlugs", new Map([["sakura-hair", { aid: "someone-else", published: true }]]));
    writeApp(root, declaration({ slug: "sakura-hair" }));

    const result = await deploySharedApp(root, stamp);
    expect(result.ok === true && result.slug).toBe("sakura-hair-2");
    expect(docs.doc("appSlugs", "sakura-hair")).toEqual({ aid: "someone-else", published: true });
    // Written BACK to app.json — the reservation cannot be read back, so a deploy that did not
    // find it there would reserve yet another name and leave this one held by nobody.
    expect(JSON.parse(readFileSync(path.join(root, "app.json"), "utf-8")).slug).toBe("sakura-hair-2");
  });

  it("makes the name resolve at publish and stop at unpublish, in that order", async () => {
    writeApp(root, declaration({ slug: "sakura-hair", public: { enabled: true, read: ["bookings"] } }));
    await deploySharedApp(root, stamp);
    docs.writes.length = 0;

    const published = await publishSharedApp(root, stamp);
    expect(published.ok === true && published.slug).toBe("sakura-hair");
    expect(docs.doc("appSlugs", "sakura-hair")).toEqual({ aid: AID, published: true });
    // After everything the name points at, before the authorization: a slug that resolved first
    // would be a link that 404s inside.
    expect(docs.writes).toEqual([
      `set apps/${AID}/collections/bookings`,
      `set apps/${AID}/config/public`,
      `set apps/${AID}`,
      "set appSlugs/sakura-hair",
      `set apps/${AID}`,
    ]);

    docs.writes.length = 0;
    await unpublishSharedApp(root);
    expect(docs.doc("appSlugs", "sakura-hair")).toEqual({ aid: AID, published: false });
    // Reversed: what grants is taken away first.
    expect(docs.writes).toEqual([`set apps/${AID}`, "set appSlugs/sakura-hair", `delete apps/${AID}/config/public`]);
  });

  it("does not make the name resolve when the app is not open to anonymous visitors", async () => {
    // A published reservation is world-readable, and what it reveals is the aid — the
    // /staging/{aid} entrance. Publishing a roster-only declaration is a normal thing to do, and
    // it must not hand that out while the same operation reports the app is closed.
    writeApp(root, declaration({ slug: "sakura-hair" }));
    await deploySharedApp(root, stamp);
    const result = await publishSharedApp(root, stamp);
    expect(result.ok === true && result.publicOpen).toBe(false);
    expect(docs.doc("appSlugs", "sakura-hair")).toEqual({ aid: AID, published: false });
  });

  it("reclaims its own reservation rather than taking a numbered one", async () => {
    // The record on the app document can be lost — a deploy that reserved and then failed to
    // record it, a document restored from before. `create` then fails for a name this app already
    // holds, and taking `-2` would strand the first reservation: live, held by an app that no
    // longer claims it, and unreadable by anyone who might notice.
    writeApp(root, declaration({ slug: "sakura-hair" }));
    await deploySharedApp(root, stamp);
    const app = docs.app();
    if (app) delete app.slug;

    const again = await deploySharedApp(root, stamp);
    expect(again.ok === true && again.slug).toBe("sakura-hair");
    expect(docs.doc("appSlugs", "sakura-hair-2")).toBeUndefined();
    expect(docs.app()?.slug).toBe("sakura-hair");
  });

  it("says so rather than reporting success when there was nothing open to close", async () => {
    await deploySharedApp(root, stamp);
    const result = await unpublishSharedApp(root);
    expect(result.ok === true && result.wasOpen).toBe(false);
  });
});
