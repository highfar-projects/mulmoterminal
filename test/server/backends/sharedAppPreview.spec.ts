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

  /** Refuse to LIST records, which is the ordinary state of an app nobody has published: the rules
   *  cannot resolve an owner for anything under a document that does not exist. Separate from
   *  `denyItemReads` because they are different operations — a lookup `get`s one document by name
   *  and a dataset `list`s a collection — and a preview has to tell them apart. */
  denyItemLists = false;

  list = (collectionPath: string): Promise<FirestoreDoc[]> => {
    if (this.denyItemLists && collectionPath.includes("/collections/")) {
      return Promise.reject(Object.assign(new Error("Missing or insufficient permissions."), { code: "permission-denied" }));
    }
    const docs = [...this.read(collectionPath)].sort(([left], [right]) => (left < right ? -1 : 1));
    return Promise.resolve(docs.map(([id, data]) => ({ id, data })));
  };

  // The rules' actual shape: `apps/{aid}`'s read resolves the roster out of the document itself, so
  // a document that does not exist is REFUSED rather than absent. A preview of an app nobody has
  // published yet meets this on its very first call, and must not treat it as a failure.
  /** Refuse the diagnostic READ as well. The rules that just denied a write are entitled to deny
   *  the read that asks why, and the two denials are independent. */
  denyItemReads = false;

  get = (collectionPath: string, docId: string): Promise<unknown | null> => {
    if (this.denyItemReads && collectionPath.includes("/collections/")) {
      return Promise.reject(Object.assign(new Error("Missing or insufficient permissions."), { code: "permission-denied" }));
    }
    const existing = this.read(collectionPath).get(docId);
    if (collectionPath === "apps" && !existing) {
      return Promise.reject(Object.assign(new Error("read refused (test)"), { code: "permission-denied" }));
    }
    return Promise.resolve(existing ?? null);
  };

  /** Create-if-absent. Recorded like any other write: a preview that "only created" the app
   *  document would still have written one. */
  /** Refuse every write, the way the deployed rules refuse one they will not authorize. */
  denyWrites = false;

  create = (collectionPath: string, docId: string, data: Record<string, unknown>): Promise<boolean> => {
    this.writes.push(`create ${collectionPath}/${docId}`);
    if (this.denyWrites) return Promise.reject(Object.assign(new Error("Missing or insufficient permissions."), { code: "permission-denied" }));
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
  fields: {
    id: { type: "string", label: "ID", primary: true, required: true },
    note: { type: "string", label: "Note" },
    // A window bound the declaration below points at. The publish gate checks that the field it
    // names EXISTS, so a fixture without it now fails before the case it is testing.
    closesAt: { type: "number", label: "Closes" },
  },
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
    // WITH A VIEWER, which the public page did not use to get. The rules let the person who
    // submitted a row move it and take it away with no role at all (`ownRow` asks for `authed()`
    // and nothing else), so a public page handed no capabilities drew no button for a cancellation
    // the rules were waiting to allow. `can` is empty here because this app declares no
    // `selfTransitions` and no `selfDelete` — an empty answer, not a missing one.
    //
    // AND `me` IS NULL, exactly as mulmoserver posts it to the live page. Nothing on this tier
    // reads it, and a published page holding the reader's address could carry it off by navigating
    // its own context once. Putting the AUTHOR's address here instead would be the preview handing
    // a page something production never gives it.
    expect(result.ok && result.pages).toEqual([{ id: "public", html, audience: "public", viewer: { me: null, can: {} } }]);
    expect(docs.writes).toEqual([]);
  });

  it("hands back what the AUTHOR has already submitted, projected as the page will see it", async () => {
    // The port that did not exist. A collection people submit to is exactly the one `public.read`
    // cannot open — one visitor would be reading every other visitor's answer — so a page cannot
    // find its own row for itself, and the pane answered "nobody looked" for ever. A page asking
    // "have I registered?" then drew its registration form on top of a registration.
    writeApp(
      root,
      declaration({
        collections: { bookings: { submitOnly: true } },
        public: {
          enabled: true,
          read: ["notes"],
          submit: { bookings: { auth: "verifiedEmail", emailField: "note", createFields: ["note", "closesAt"] } },
        },
      }),
    );
    docs.store.set(
      `apps/${AID}/collections/bookings/items`,
      new Map([
        ["mine", { note: OWNER.email, closesAt: 5, status: "approved", staffNote: "難しい客" }],
        ["theirs", { note: "somebody@example.com", closesAt: 6 }],
      ]),
    );

    const result = await previewSharedApp(root, stamp);

    expect(result.ok === false ? result.problems : []).toEqual([]);
    // THEIRS IS NOT HERE. The read is made as the author (this is their machine) and then filtered
    // to their own rows by the same selectors the rules identify one by — a preview that showed
    // more than production is the one direction this must never fail in.
    //
    // AND NEITHER IS `status` OR `staffNote`. `ownRow` in the rules hands back the whole document;
    // what a page in this position could have SENT is narrower, and handing over the rest would
    // widen what a published page knows about the app in order to tell it something it already
    // knew. `closesAt` survives because the form draws it; `note` is the address field the host
    // fills in, so it does not.
    expect(result.ok && result.own).toEqual({ bookings: [{ id: "mine", closesAt: 5 }] });
  });

  it("finds an own row whose identity is the document NAME, not a field", async () => {
    // The FOURTH id shape, and the one that was missing: `idFrom: "auth.uid+field"` puts the uid in
    // the document name, and an `anonymous` app has no address and no uid FIELD to find it by. That
    // is live-poll's whole shape — so its author's votes were absent from `viewer.mine`, the page
    // asked `view.mine()` about them and could not act on them.
    //
    // Rebuilt from the STORED value rather than matched as a prefix, which is the rules' own shape:
    // an unconditional prefix match would let somebody create `<victim uid>_x` in a collection with
    // a different strategy and grow rights over it.
    writeApp(
      root,
      declaration({
        collections: { bookings: { submitOnly: true } },
        public: {
          enabled: true,
          read: ["notes"],
          submit: { bookings: { auth: "anonymous", createFields: ["note"], idFrom: "auth.uid+field", idField: "note" } },
        },
      }),
    );
    docs.store.set(
      `apps/${AID}/collections/bookings/items`,
      new Map([
        [`${OWNER.uid}_q1`, { note: "q1" }],
        // Somebody else's, under the same strategy: the name does not rebuild from THIS reader's uid.
        ["uid-someone_q1", { note: "q1" }],
        // And a name that does not rebuild from its own stored value, which is what the prefix match
        // this deliberately is not would have accepted.
        [`${OWNER.uid}_q9`, { note: "q1" }],
      ]),
    );

    const result = await previewSharedApp(root, stamp);

    expect(result.ok && result.own).toEqual({ bookings: [{ id: `${OWNER.uid}_q1`, note: "q1" }] });
  });

  it("says nothing about a collection whose rows could not be read", async () => {
    // ABSENT is "nobody looked" and an empty array is "you have submitted nothing". A page told the
    // second when the first is true stops offering an action to somebody entitled to it, which is
    // the bug this whole port exists to prevent — arriving from the other direction.
    writeApp(
      root,
      declaration({
        collections: { bookings: { submitOnly: true } },
        public: {
          enabled: true,
          read: ["notes"],
          submit: { bookings: { auth: "verifiedEmail", emailField: "note", createFields: ["note", "closesAt"] } },
        },
      }),
    );
    docs.denyItemLists = true;

    const result = await previewSharedApp(root, stamp);

    expect(result.ok && result.own).toEqual({});
  });

  it("refuses a page it cannot read, rather than previewing an app without it", async () => {
    writeApp(root, declaration({ public: { read: ["bookings"], view: { path: "views/missing.html", collections: ["bookings"] } } }));

    const result = await previewSharedApp(root, stamp);

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.problems.length).toBeGreaterThan(0);
    // A refusal from a run that writes nothing is never partial.
    expect(result.ok === false && result.partial).toBe(false);
  });

  it("hands each page only the collections ITS OWN projection names", async () => {
    // `notes` is open to the roster and NOT in `public.read`. Both pages exist, and the member one
    // draws a collection a visitor may never see.
    mkdirSync(path.join(root, "views"), { recursive: true });
    writeApp(
      root,
      declaration({
        public: { read: ["bookings"] },
        views: [
          { id: "public", path: "views/front.html", audience: "public", collections: ["bookings"] },
          { id: "desk", path: "views/desk.html", audience: "member", collections: ["notes"] },
        ],
      }),
    );
    writeFileSync(path.join(root, "views", "desk.html"), "<p>desk</p>");
    writeFileSync(path.join(root, "views", "front.html"), "<p>front</p>");
    docs.store.set(`apps/${AID}/collections/bookings/items`, new Map([["b1", { slot: "10:00" }]]));
    docs.store.set(`apps/${AID}/collections/notes/items`, new Map([["n1", { body: "private" }]]));

    const result = await previewSharedApp(root, stamp);

    expect(result.ok === false ? result.problems : []).toEqual([]);
    // The public page must NOT receive `notes`. One map for the whole app would hand it over — the
    // preview showing MORE than production, which is the one direction it may never fail in.
    expect(result.ok && Object.keys(result.datasets["public:public"] ?? {})).toEqual(["bookings"]);
    expect(result.ok && Object.keys(result.datasets["member:desk"] ?? {})).toEqual(["notes"]);
    expect(docs.writes).toEqual([]);
  });

  it("says which collections a page WATCHES, so the pane can keep it current", async () => {
    // The pane reads once. A page that declared `live` is written for `onState` to arrive again —
    // production subscribes and re-delivers — so previewed here it stood still while the published
    // one moved, and somebody else's message never appeared. This is what tells the pane to re-read,
    // and it must be per page: an app can watch on one page and not on another.
    mkdirSync(path.join(root, "views"), { recursive: true });
    writeApp(
      root,
      declaration({
        public: { read: ["bookings"] },
        views: [
          { id: "public", path: "views/front.html", audience: "public", collections: ["bookings"], live: ["bookings"] },
          { id: "room", path: "views/room.html", audience: "member", collections: ["notes"], live: ["notes"] },
          { id: "ledger", path: "views/ledger.html", audience: "member", collections: ["notes"] },
        ],
      }),
    );
    writeFileSync(path.join(root, "views", "front.html"), "<p>front</p>");
    writeFileSync(path.join(root, "views", "room.html"), "<p>room</p>");
    writeFileSync(path.join(root, "views", "ledger.html"), "<p>ledger</p>");

    const result = await previewSharedApp(root, stamp);

    expect(result.ok === false ? result.problems : []).toEqual([]);
    const live = result.ok ? Object.fromEntries(result.pages.map((page) => [`${page.audience}:${page.id}`, page.live])) : {};
    expect(live["member:room"]).toEqual(["notes"]);
    // Declared nothing, so there is nothing to poll for — absent rather than empty, and the pane
    // reads that page exactly as often as it did before any of this.
    expect(live["member:ledger"]).toBeUndefined();
    // The anonymous page has its own watch list, in its own document.
    expect(live["public:public"]).toEqual(["bookings"]);
    expect(docs.writes).toEqual([]);
  });

  it("carries what a public create may contain, so the parent can judge a submission", async () => {
    writeApp(root, declaration({ public: { read: ["bookings"], submit: { bookings: { auth: "verifiedEmail", createFields: ["note"] } } } }));

    const result = await previewSharedApp(root, stamp);
    expect(result.ok === false ? result.problems : []).toEqual([]);

    // Without this the parent in the browser has nothing to check against, and it does not fall
    // open — it refuses EVERY submission as `unknown-collection`, which reads as "your declaration
    // is wrong" about a declaration that is right.
    expect(result.ok && result.submit).toEqual({ bookings: { createFields: ["note"] } });
  });

  it("reduces the generated form to the boxes a visitor actually fills in", async () => {
    mkdirSync(path.join(root, ".claude", "skills", "signups"), { recursive: true });
    writeFileSync(
      path.join(root, ".claude", "skills", "signups", "schema.json"),
      JSON.stringify({
        title: "signups",
        icon: "star",
        primaryKey: "id",
        storage: { type: "firestore" },
        fields: {
          id: { type: "string", label: "ID", primary: true, required: true },
          name: { type: "string", label: "お名前", required: true },
          plan: { type: "enum", label: "Plan", values: ["A", "B"] },
          email: { type: "email", label: "Email" },
        },
      }),
    );
    writeApp(
      root,
      declaration({
        collections: { signups: { submitOnly: true } },
        public: { submit: { signups: { auth: "verifiedEmail", createFields: ["name", "plan", "email"], emailField: "email" } } },
      }),
    );

    const result = await previewSharedApp(root, stamp);
    expect(result.ok === false ? result.problems : []).toEqual([]);

    // The ADDRESS is not one of them. The rules compare it to `request.auth.token.email`, so a box
    // for it can only be filled in wrongly — and the pane must not offer what the site does not.
    // The order is the declaration's, and an `enum`'s choices travel with it because neither page
    // may read the schema.
    expect(result.ok && result.formInputs).toEqual({
      signups: [
        { name: "name", label: "お名前", required: true, type: "string" },
        { name: "plan", label: "Plan", required: false, type: "enum", values: ["A", "B"] },
      ],
    });
    expect(result.ok && result.generatedForm).toBe(true);
    expect(docs.writes).toEqual([]);
  });

  it("keeps the uid out of the boxes too, and it is the one a visitor could have filled in", async () => {
    // The stamp draws a box nothing can usefully be typed into; a uid draws one a visitor CAN
    // complete, and every value they could put in it is refused by `uidOk`. The pane must not offer
    // what the site does not — it is the same `writableFields` on both sides, which is what makes
    // the preview evidence rather than a second opinion.
    mkdirSync(path.join(root, ".claude", "skills", "claims"), { recursive: true });
    writeFileSync(
      path.join(root, ".claude", "skills", "claims", "schema.json"),
      JSON.stringify({
        title: "claims",
        icon: "task",
        primaryKey: "id",
        storage: { type: "firestore" },
        fields: {
          id: { type: "string", label: "ID", primary: true, required: true },
          taskId: { type: "string", label: "作業", required: true },
          who: { type: "string", label: "名前" },
          uid: { type: "string", label: "uid" },
        },
      }),
    );
    writeApp(
      root,
      declaration({
        collections: { claims: { submitOnly: true } },
        public: { submit: { claims: { auth: "verifiedEmail", uidField: "uid", createFields: ["taskId", "who", "uid"] } } },
      }),
    );

    const result = await previewSharedApp(root, stamp);
    expect(result.ok === false ? result.problems : []).toEqual([]);
    expect(result.ok && result.formInputs).toEqual({
      claims: [
        { name: "taskId", label: "作業", required: true, type: "string" },
        { name: "who", label: "名前", required: false, type: "string" },
      ],
    });
  });

  it("hands an own-scope page the reader's own rows, found by uid — and nobody else's", async () => {
    // The only host-side implementation of uid ownership. Reading as the owner would return every
    // row for a page whose reader is only ever shown their own, which makes the preview show MORE
    // than production — the one direction it must never fail in. The foreign row is the assertion:
    // a filter that matched nothing and a filter that matched everything both leave a green test
    // if only the author's own row is in the fixture.
    mkdirSync(path.join(root, "views"), { recursive: true });
    mkdirSync(path.join(root, ".claude", "skills", "claims"), { recursive: true });
    writeFileSync(
      path.join(root, ".claude", "skills", "claims", "schema.json"),
      JSON.stringify({
        title: "claims",
        icon: "task",
        primaryKey: "id",
        storage: { type: "firestore" },
        fields: {
          id: { type: "string", label: "ID", primary: true, required: true },
          taskId: { type: "string", label: "作業", required: true },
          uid: { type: "string", label: "uid" },
        },
      }),
    );
    writeFileSync(path.join(root, "views", "mine.html"), "<p>mine</p>");
    writeApp(
      root,
      declaration({
        collections: { claims: { submitOnly: true } },
        views: [{ id: "mine", path: "views/mine.html", audience: "participant", collections: ["claims"] }],
        public: { submit: { claims: { auth: "verifiedEmail", uidField: "uid", createFields: ["taskId", "uid"] } } },
      }),
    );
    docs.store.set(
      `apps/${AID}/collections/claims/items`,
      new Map([
        ["mine-1", { taskId: "mine-1", uid: OWNER.uid }],
        ["theirs-1", { taskId: "theirs-1", uid: "uid-somebody-else" }],
      ]),
    );

    const result = await previewSharedApp(root, stamp);

    expect(result.ok === false ? result.problems : []).toEqual([]);
    // Keyed by TIER, and the participant tier is called `roster` — the audience an author writes
    // and the document the projection lands on are not the same word.
    expect(result.ok && (result.datasets["roster:mine"]?.claims ?? []).map((row) => row.id)).toEqual(["mine-1"]);
  });

  it("keeps a collection whose whole submission is filled in by the host", async () => {
    // "Count me in": with `uidField` the identity of whoever pressed the button IS the submission,
    // so the generated form has no inputs — and it is still a form. Dropped for having no fields,
    // the pane would show no collection and no "Send it", leaving the one shape whose page cannot
    // be written by hand as the one an author cannot try.
    mkdirSync(path.join(root, ".claude", "skills", "claims"), { recursive: true });
    writeFileSync(
      path.join(root, ".claude", "skills", "claims", "schema.json"),
      JSON.stringify({
        title: "claims",
        icon: "task",
        primaryKey: "id",
        storage: { type: "firestore" },
        fields: {
          id: { type: "string", label: "ID", primary: true, required: true },
          uid: { type: "string", label: "uid" },
        },
      }),
    );
    writeApp(
      root,
      declaration({
        collections: { claims: { submitOnly: true } },
        public: { submit: { claims: { auth: "verifiedEmail", uidField: "uid", createFields: ["uid"] } } },
      }),
    );

    const result = await previewSharedApp(root, stamp);

    expect(result.ok === false ? result.problems : []).toEqual([]);
    expect(result.ok && result.formInputs).toEqual({ claims: [] });
    expect(result.ok && result.generatedForm).toBe(true);
  });

  it("names the declaration a refused write fell foul of, rather than relaying a bare denial", async () => {
    const { writePreviewSubmission } = await import("../../../server/backends/sharedApp/previewWrite.js");
    const closed = 1_600_000_000_000;
    writeApp(
      root,
      declaration({
        public: {
          read: ["bookings"],
          submit: {
            bookings: {
              auth: "verifiedEmail",
              createFields: ["note"],
              window: { untilField: { ref: "note", collection: "bookings", field: "closesAt" } },
            },
          },
        },
      }),
    );
    docs.store.set(`apps/${AID}/collections/bookings/items`, new Map([["slot-1", { closesAt: closed }]]));
    // Every write is refused, exactly as the deployed rules refuse one whose window has passed.
    docs.denyWrites = true;

    const result = await writePreviewSubmission(root, "bookings", { note: "slot-1" });

    // "Missing or insufficient permissions" names nothing, and the author is the one person who
    // could act on the answer. The declaration is walked to find the condition that does not hold.
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain("closed at");
    expect(result.ok === false && result.error).toContain("bookings/slot-1");
  });

  it("still reports the refusal when the read that would explain it is refused too", async () => {
    const { writePreviewSubmission } = await import("../../../server/backends/sharedApp/previewWrite.js");
    writeApp(
      root,
      declaration({
        public: {
          read: ["bookings"],
          submit: {
            bookings: {
              auth: "verifiedEmail",
              createFields: ["note"],
              window: { untilField: { ref: "note", collection: "bookings", field: "closesAt" } },
            },
          },
        },
      }),
    );
    docs.denyWrites = true;
    docs.denyItemReads = true;

    const result = await writePreviewSubmission(root, "bookings", { note: "slot-1" });

    // The diagnostic is BEST EFFORT. It runs only because a write was already refused, and that
    // refusal is the answer being reported — letting the second denial throw would replace a named
    // failure with a 500 the route turns into nothing on the author's screen.
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain("insufficient permissions");
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
