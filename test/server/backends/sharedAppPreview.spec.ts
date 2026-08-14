// @vitest-environment node
//
// The dry run: everything publish would write, computed without writing any of it.
//
// What is pinned here is the three properties that make a preview worth having, each of which has
// an easier and wrong version (design: `plans/feat-shared-app-preview.md`):
//
//   NOTHING IS WRITTEN. The whole point is a run the author can make before the first byte reaches
//   Firestore, and a preview that staged "just the schemas" would be a deploy under another name.
//
//   IT DRAWS FROM THE PUBLISH PROJECTION. A page reads the projection, never the repository, so a
//   preview handed the declaration would show collections `public.read` does not open. That is the
//   failure this catches, and it is invisible on the author's screen — everything renders.
//
//   IT NEEDS NO SLUG. The name is the one irreversible write out of a namespace everybody shares,
//   and nothing can ask whether one is free without consuming it. A preview that reserved one would
//   burn a name per abandoned app.
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { setFirestoreAccessor, setSharedCollectionsSupport, type FirestoreDocs, type FirestoreDoc } from "@mulmoclaude/core/collection/server";
import { initCollectionsBackend } from "../../../server/backends/collections.js";
import { previewSharedApp } from "../../../server/backends/sharedApp/preview.js";
import { makeTempDir } from "../../support/tempDir";

const AID = "app-under-preview";
const OWNER = { uid: "uid-owner", email: "owner@example.com" };

/** An in-memory store that RECORDS EVERY WRITE. Recording them is the assertion in the first test:
 *  a store that only kept final state would pass a preview that wrote and then cleaned up. */
class RecordingDocs implements FirestoreDocs {
  readonly store = new Map<string, Map<string, Record<string, unknown>>>();
  readonly writes: string[] = [];

  /** Reading must not CREATE the bucket. `store.size` is an assertion in this file, and a fake
   *  that grew a collection on every read would report a preview as having touched the database. */
  private read(collectionPath: string): Map<string, Record<string, unknown>> {
    return this.store.get(collectionPath) ?? new Map();
  }

  private bucket(collectionPath: string): Map<string, Record<string, unknown>> {
    const existing = this.store.get(collectionPath);
    if (existing) return existing;
    const created = new Map<string, Record<string, unknown>>();
    this.store.set(collectionPath, created);
    return created;
  }

  list = (collectionPath: string): Promise<FirestoreDoc[]> => {
    const docs = [...this.read(collectionPath)].sort(([left], [right]) => (left < right ? -1 : 1));
    return Promise.resolve(docs.map(([id, data]) => ({ id, data })));
  };

  // The rules' actual shape: `apps/{aid}`'s read resolves the roster out of the document itself, so
  // a document that does not exist is REFUSED rather than absent. A preview of an app nobody has
  // published yet meets this on its very first call, and must not treat it as a failure.
  get = (collectionPath: string, docId: string): Promise<unknown | null> => {
    const existing = this.read(collectionPath).get(docId);
    if (collectionPath === "apps" && !existing) {
      return Promise.reject(Object.assign(new Error("read refused (test)"), { code: "permission-denied" }));
    }
    return Promise.resolve(existing ?? null);
  };

  /** Create-if-absent. Recorded like any other write: a preview that "only created" the app
   *  document would still have written one. */
  create = (collectionPath: string, docId: string, data: Record<string, unknown>): Promise<boolean> => {
    this.writes.push(`create ${collectionPath}/${docId}`);
    if (this.read(collectionPath).has(docId)) return Promise.resolve(false);
    this.bucket(collectionPath).set(docId, data);
    return Promise.resolve(true);
  };

  set = (collectionPath: string, docId: string, data: Record<string, unknown>): Promise<void> => {
    this.writes.push(`set ${collectionPath}/${docId}`);
    this.bucket(collectionPath).set(docId, data);
    return Promise.resolve();
  };

  delete = (collectionPath: string, docId: string): Promise<boolean> => {
    this.writes.push(`delete ${collectionPath}/${docId}`);
    return Promise.resolve(this.bucket(collectionPath).delete(docId));
  };

  watch = (): (() => void) => () => {};
}

let docs = new RecordingDocs();

const schemaFor = (slug: string) => ({
  title: slug,
  icon: "star",
  primaryKey: "id",
  storage: { type: "firestore" },
  fields: { id: { type: "string", label: "ID", primary: true, required: true }, note: { type: "string", label: "Note" } },
});

function writeCollection(root: string, slug: string): void {
  mkdirSync(path.join(root, ".claude", "skills", slug), { recursive: true });
  writeFileSync(path.join(root, ".claude", "skills", slug, "schema.json"), JSON.stringify(schemaFor(slug)));
}

const declaration = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  aid: AID,
  name: "App Under Preview",
  members: { [OWNER.email]: { "*": "owner" } },
  ...extra,
});

function writeApp(root: string, app: Record<string, unknown>): void {
  writeFileSync(path.join(root, "app.json"), JSON.stringify(app));
}

const stamp = { now: () => 1_700_000_000_000, resolveCommit: () => Promise.resolve({ commit: "c0ffee", dirty: false }) };

let root = "";

describe("shared app preview", () => {
  beforeAll(() => {
    initCollectionsBackend({ workspace: makeTempDir("mt-preview-ws-") });
    setSharedCollectionsSupport(true);
    setFirestoreAccessor(() => ({ docs, email: OWNER.email, uid: OWNER.uid }));
  });

  beforeEach(() => {
    docs = new RecordingDocs();
    root = makeTempDir("mt-preview-");
    writeApp(root, declaration());
    writeCollection(root, "bookings");
    writeCollection(root, "notes");
  });

  it("writes nothing at all — not the app document, not the staged schemas, not the config", async () => {
    const result = await previewSharedApp(root, stamp);

    expect(result.ok === false ? result.problems : []).toEqual([]);
    expect(result.ok).toBe(true);
    // The assertion this whole file exists for. Every other property could be satisfied by a
    // deploy that reported nicely.
    expect(docs.writes).toEqual([]);
    expect(docs.store.size).toBe(0);
  });

  it("previews an app nobody has ever deployed — the refused app read is not a failure", async () => {
    const result = await previewSharedApp(root, stamp);

    expect(result.ok).toBe(true);
    // Said out loud rather than inferred: the projection carries non-publish keys forward from the
    // live document, so a preview computed without one is the projection of a FIRST publish.
    expect(result.ok && result.fromLiveApp).toBe(false);
  });

  it("shows only what `public.read` opens — not every collection in the repository", async () => {
    writeApp(root, declaration({ public: { read: ["bookings"] } }));

    const result = await previewSharedApp(root, stamp);

    expect(result.ok).toBe(true);
    // `notes` exists on disk and is deployed like any other collection. What a visitor may read is
    // the PROJECTION's answer, and drawing from the declaration instead is how "it all showed up on
    // my machine" happens.
    expect(result.ok && result.config.read).toEqual(["bookings"]);
    expect(result.ok && result.publicOpen).toBe(true);
  });

  it("is a normal outcome for an app with no public block — it just is not open", async () => {
    const result = await previewSharedApp(root, stamp);

    expect(result.ok).toBe(true);
    expect(result.ok && result.publicOpen).toBe(false);
  });

  it("needs no slug — the one irreversible write out of a shared namespace stays publish's", async () => {
    // No `slug` in the declaration, and none is reserved. A preview that took a name would consume
    // one per app that never ships (principle 9).
    const result = await previewSharedApp(root, stamp);

    expect(result.ok).toBe(true);
    expect(docs.store.get("appSlugs")).toBeUndefined();
    expect(docs.writes.filter((write) => write.includes("appSlugs"))).toEqual([]);
  });

  it("hands back the author's page, byte for byte", async () => {
    const html = "<h1>Book a slot</h1><script>__MC_APP_VIEW.ready()</script>";
    mkdirSync(path.join(root, "views"), { recursive: true });
    writeFileSync(path.join(root, "views", "booking.html"), html);
    writeApp(root, declaration({ public: { read: ["bookings"], view: { path: "views/booking.html", collections: ["bookings"] } } }));

    const result = await previewSharedApp(root, stamp);

    expect(result.ok === false ? result.problems : []).toEqual([]);
    expect(result.ok && result.publicPage?.html).toBe(html);
    expect(docs.writes).toEqual([]);
  });

  it("refuses a page it cannot read, rather than previewing an app without it", async () => {
    writeApp(root, declaration({ public: { read: ["bookings"], view: { path: "views/missing.html", collections: ["bookings"] } } }));

    const result = await previewSharedApp(root, stamp);

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.problems.length).toBeGreaterThan(0);
    // A refusal from a run that writes nothing is never partial.
    expect(result.ok === false && result.partial).toBe(false);
  });

  it("carries the live app's keys forward when there is one to read", async () => {
    docs.store.set(
      "apps",
      new Map([[AID, { owner: OWNER.uid, members: { [OWNER.email]: { "*": "owner" } }, memberEmails: [OWNER.email], slug: "already-held" }]]),
    );

    const result = await previewSharedApp(root, stamp);

    expect(result.ok).toBe(true);
    expect(result.ok && result.fromLiveApp).toBe(true);
    expect(docs.writes).toEqual([]);
  });
});
