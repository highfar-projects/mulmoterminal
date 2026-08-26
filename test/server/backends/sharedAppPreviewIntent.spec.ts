// @vitest-environment node
//
// A MEMBER'S move, made from the preview.
//
// The property under test is one sentence and it is the whole file: the preview must not be LOOSER
// than production. The author is the app's owner, so the deployed rules would let them move almost
// any record — a host that wrote first and let the rules judge would perform moves the projection
// forbids the reader whose page is actually on screen, and every one of them would succeed. So the
// projection is judged here, against the page the ask came from, and these tests are what says so.
//
// The rest is the same shape `sharedAppPreviewWrite.spec.ts` pins, for the same reasons: the
// operations go through a BATCH because the rules read the second document of each pair with
// `getAfter()`, and a pair written singly is refused with nothing to tell the author about it.
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { setFirestoreAccessor, setSharedCollectionsSupport, type FirestoreDocs, type FirestoreDoc } from "@mulmoclaude/core/collection/server";
import { initCollectionsBackend } from "../../../server/backends/collections.js";
import { performPreviewIntent } from "../../../server/backends/sharedApp/previewIntent.js";
import type { PreviewIntent } from "../../../common/sharedAppPreview.js";
import { makeTempDir } from "../../support/tempDir";

const AID = "app-under-intent";
const OWNER = { uid: "uid-owner", email: "owner@example.com" };

/** Every operation a batch performed, in order — recorded on COMMIT, so a host that built a pair
 *  and never sent it fails rather than passes. */
const batched: string[] = [];
let batchFails = false;

vi.mock("firebase/firestore", () => ({
  collection: (_db: unknown, collectionPath: string) => ({ collectionPath }),
  FieldPath: class {
    segments: string[];
    constructor(...segments: string[]) {
      this.segments = segments;
    }
  },
  serverTimestamp: () => ({ __serverTimestamp: true }),
  doc: (parent: { collectionPath: string }, docId: string) => ({ path: `${parent.collectionPath}/${docId}` }),
  writeBatch: () => {
    const ops: string[] = [];
    return {
      set: (ref: { path: string }, data: Record<string, unknown>) => ops.push(`set ${ref.path} ${JSON.stringify(data)}`),
      // Both call shapes. A record's declared field goes through a FieldPath — a dotted name is a
      // literal key, not a path into a map — while the mirror's `state` is ours and fixed.
      update: (ref: { path: string }, data: Record<string, unknown> | { segments: string[] }, value?: unknown) => {
        const asPath = data as { segments?: string[] };
        const written = Array.isArray(asPath.segments) ? { [asPath.segments.join(".")]: value } : data;
        ops.push(`update ${ref.path} ${JSON.stringify(written)}`);
      },
      delete: (ref: { path: string }) => ops.push(`delete ${ref.path}`),
      commit: () => {
        if (batchFails) return Promise.reject(Object.assign(new Error("Missing or insufficient permissions."), { code: "permission-denied" }));
        batched.push(...ops);
        return Promise.resolve();
      },
    };
  },
}));

vi.mock("../../../server/backends/remoteHost/session.js", () => ({ currentFirestore: () => ({}) }));

class Docs implements FirestoreDocs {
  readonly store = new Map<string, Map<string, Record<string, unknown>>>();

  private read(collectionPath: string): Map<string, Record<string, unknown>> {
    return this.store.get(collectionPath) ?? new Map();
  }

  /** Refuse to LIST records while leaving a `get` working — which is not a contrived pair. A list
   *  refused on an app published a moment ago, an offline blink, a transient: the page's keyed
   *  `view.mine(cid, key)` is a `get` and answers anyway. */
  denyItemLists = false;

  list = (collectionPath: string): Promise<FirestoreDoc[]> => {
    if (this.denyItemLists && collectionPath.includes("/collections/")) {
      return Promise.reject(Object.assign(new Error("Missing or insufficient permissions."), { code: "permission-denied" }));
    }
    return Promise.resolve([...this.read(collectionPath)].sort(([l], [r]) => (l < r ? -1 : 1)).map(([id, data]) => ({ id, data })));
  };

  get = (collectionPath: string, docId: string): Promise<unknown | null> => {
    const existing = this.read(collectionPath).get(docId);
    // The rules' shape: a missing app document is REFUSED, not absent.
    if (collectionPath === "apps" && !existing) return Promise.reject(Object.assign(new Error("refused"), { code: "permission-denied" }));
    return Promise.resolve(existing ?? null);
  };

  create = (): Promise<boolean> => Promise.resolve(true);
  set = (): Promise<void> => Promise.resolve();
  delete = (): Promise<boolean> => Promise.resolve(true);
  watch = (): (() => void) => () => {};
}

let docs = new Docs();
let root = "";

const schemaFor = (slug: string, fields: Record<string, unknown>) => ({
  title: slug,
  icon: "star",
  primaryKey: "id",
  storage: { type: "firestore" },
  fields: { id: { type: "string", label: "ID", primary: true, required: true }, ...fields },
});

function writeCollection(slug: string, fields: Record<string, unknown>): void {
  mkdirSync(path.join(root, ".claude", "skills", slug), { recursive: true });
  writeFileSync(path.join(root, ".claude", "skills", slug, "schema.json"), JSON.stringify(schemaFor(slug, fields)));
}

/** A live poll, shaped like the app this was built for: the desk opens one question at a time, and
 *  a question that is `closed` may be asked again. */
const pollApp = (over: Record<string, unknown> = {}) => ({
  aid: AID,
  name: "Poll",
  members: { [OWNER.email]: { "*": "owner" } },
  collections: {
    questions: { statusField: "state", transitions: { initial: ["draft"], draft: ["open"], open: ["closed"], closed: ["open"] } },
  },
  views: [{ id: "desk", audience: "member", path: "views/desk.html", collections: ["questions"] }],
  ...over,
});

function writeApp(app: Record<string, unknown>): void {
  writeFileSync(path.join(root, "app.json"), JSON.stringify(app));
  mkdirSync(path.join(root, "views"), { recursive: true });
  writeFileSync(path.join(root, "views", "desk.html"), "<div id='list'></div><script>window.__MC_APP_VIEW.ready();</script>");
}

const asked = (over: Partial<PreviewIntent> = {}): PreviewIntent => ({
  page: { id: "desk", audience: "member" },
  kind: "transition",
  cid: "questions",
  itemId: "q1",
  to: "open",
  ...over,
});

/** A booking app: the slot is contested (so a withdrawal has a mirror to reopen), the desk assigns
 *  rows, and one transition queues a notice. Everything the poll above does not have.
 *
 *  Shaped after `server/skills/mulmoterminal-shared-app/templates/salon.md` rather than invented:
 *  `mail` hangs off the collection, `selfDelete` and `mirror` off the SUBMIT declaration, and a
 *  withdrawal is the participant's own — `withdrawFrom` is the roster tier's and empty on a staff
 *  page, so a desk cannot make one however entitled it is otherwise.
 *
 *  The booking is the AUTHOR's, because a participant page is read at `scope: "own"`: a row
 *  belonging to anybody else is not in the dataset it is handed, and would be refused. */
const bookingApp = () => ({
  aid: AID,
  name: "Rooms",
  members: { [OWNER.email]: { "*": "owner" } },
  collections: {
    bookings: {
      submitOnly: true,
      statusField: "status",
      assigneeField: "handledBy",
      transitions: { initial: ["booked"], booked: ["approved"] },
      mail: { toField: "requesterEmail", on: { approved: { from: ["booked"], to: "approved" } } },
    },
    slots: { mirrorOf: "bookings" },
  },
  views: [
    { id: "desk", audience: "member", path: "views/desk.html", collections: ["bookings"] },
    { id: "mine", audience: "participant", path: "views/desk.html", collections: ["bookings"] },
    // The page the booking was made on. It draws `slots`, which is all `public.read` opens — the
    // bookings themselves are the one thing a public page must never list.
    { id: "public", audience: "public", path: "views/desk.html", collections: ["slots"] },
  ],
  public: {
    enabled: true,
    read: ["slots"],
    submit: {
      bookings: {
        auth: "verifiedEmail",
        emailField: "requesterEmail",
        createFields: ["requesterEmail", "slot", "status"],
        initialStatus: "booked",
        idFrom: "field",
        idField: "slot",
        idIn: { collection: "slots", where: { field: "state", equals: "open" } },
        mirror: "slots",
        // BOTH, which is the salon/gym shape. `selfTransitions` is what gives the participant tier a
        // `statusField` at all (`transitionPart` reads the collection's table only for `member`),
        // and `judgeWithdraw` requires one before it will consult `selfDelete` — so an app carrying
        // `selfDelete` alone draws no withdrawal control anywhere. Declared here to exercise the
        // path, not to work around that: it is the package's judgement, and the live page reads it
        // the same way.
        selfTransitions: { booked: ["cancelled"] },
        selfDelete: ["booked"],
      },
    },
  },
});

const itemsPath = `apps/${AID}/collections/questions/items`;
const bookingsPath = `apps/${AID}/collections/bookings/items`;

describe("a member's intent, performed from the preview", () => {
  beforeAll(() => {
    initCollectionsBackend({ workspace: makeTempDir("mt-intent-ws-") });
    setSharedCollectionsSupport(true);
    setFirestoreAccessor(() => ({ docs, email: OWNER.email, uid: OWNER.uid }));
  });

  beforeEach(() => {
    docs = new Docs();
    batched.length = 0;
    batchFails = false;
    root = makeTempDir("mt-intent-");
    writeCollection("questions", {
      text: { type: "string", label: "Question", required: true },
      state: { type: "enum", label: "State", values: ["draft", "open", "closed"] },
    });
    writeApp(pollApp());
    docs.store.set("apps", new Map([[AID, { owner: OWNER.uid, members: { [OWNER.email]: { "*": "owner" } }, memberEmails: [OWNER.email] }]]));
    docs.store.set(itemsPath, new Map([["q1", { text: "Falcon 9?", state: "draft" }]]));
  });

  // --- a correction --------------------------------------------------------------------------
  //
  // The pane is how an author finds out whether the edit button they just wrote works, BEFORE the
  // page is published — so a correction the live parent performs and this one drops is a control
  // the author can only test in production, on real records.

  const correction = (over: Partial<PreviewIntent> = {}): PreviewIntent => ({
    page: { id: "desk", audience: "member" },
    kind: "correct",
    cid: "questions",
    itemId: "q1",
    values: { text: "Falcon Heavy?" },
    ...over,
  });

  it("writes the fields the page named, and only those", async () => {
    expect(await performPreviewIntent(root, correction())).toEqual({ ok: true, mailed: false });
    expect(batched).toEqual([`update ${itemsPath}/q1 {"text":"Falcon Heavy?"}`]);
  });

  it("refuses the status field, because that is what a transition is for", async () => {
    const result = await performPreviewIntent(root, correction({ values: { state: "open" } }));
    expect(result).toEqual({ ok: false, error: "status-field" });
    expect(batched).toEqual([]);
  });

  it("refuses a correction naming no fields rather than writing an empty update", async () => {
    // An `update` carrying nothing succeeds and writes nothing, which would be reported as a
    // correction that happened.
    expect(await performPreviewIntent(root, correction({ values: {} }))).toEqual({ ok: false, error: "nothing-to-correct" });
    expect(batched).toEqual([]);
  });

  it("moves the one field the declaration names, and nothing else", async () => {
    const result = await performPreviewIntent(root, asked());

    expect(result).toEqual({ ok: true, mailed: false });
    // The FIELD, not the record. A host that wrote the whole document would erase every key the
    // page does not hold — and a member's page holds only what its projection carries.
    expect(batched).toEqual([`update ${itemsPath}/q1 {"state":"open"}`]);
  });

  it("refuses a move the declared table does not carry, without touching the database", async () => {
    // `draft` goes to `open` and nowhere else. The rules would refuse this too — a moment later,
    // and naming nothing, which is what makes refusing it here worth doing.
    const result = await performPreviewIntent(root, asked({ to: "closed" }));

    expect(result).toEqual({ ok: false, error: "illegal-transition" });
    expect(batched).toEqual([]);
  });

  it("refuses a collection the page's own view does not declare", async () => {
    const result = await performPreviewIntent(root, asked({ cid: "votes" }));

    expect(result).toEqual({ ok: false, error: "unknown-collection" });
    expect(batched).toEqual([]);
  });

  it("refuses an intent from a page the projection no longer has", async () => {
    // `app.json` changed under a document that is still on screen. Judging its ask against whatever
    // page happens to be first would perform a move on a projection nobody is looking at.
    const result = await performPreviewIntent(root, asked({ page: { id: "gone", audience: "member" } }));

    expect(result).toEqual({ ok: false, error: "no-such-page" });
    expect(batched).toEqual([]);
  });

  it("judges an intent from a PUBLIC page as a participant's, rather than refusing it by kind", async () => {
    // It used to be refused by name — "a public page has no reader, no roles and no tier". Two of
    // those are true and the conclusion was not: `ownRow` in the rules asks for `authed()` and
    // nothing else, and the moves it allows are declared in `public.submit[cid]`. So the visitor who
    // submitted a row may move it exactly as a participant may, and the refusal was the host's
    // shape rather than the app's rule.
    //
    // This app publishes no public page at all, so the answer is still no — but it is
    // `no-such-page`, which says which page the ask named, rather than "wrong kind of page", which
    // named nothing the author could act on. The app below has one, and performs.
    const result = await performPreviewIntent(root, asked({ page: { id: "public", audience: "public" } }));

    expect(result).toEqual({ ok: false, error: "no-such-page" });
    expect(batched).toEqual([]);
  });

  // THE ONE THIS FILE EXISTS FOR. The author is the app's OWNER, so the deployed rules would let
  // them move this record — a host that wrote first and let the rules judge would perform it, and
  // the preview would then be looser than the page it is previewing. The projection says this
  // reader holds no writing role on `questions`, and that is what decides.
  it("refuses a move this reader's ROLE does not carry, though the rules would allow it", async () => {
    writeApp(pollApp({ members: { [OWNER.email]: { "*": "owner", questions: "viewer" } } }));

    const result = await performPreviewIntent(root, asked());

    expect(result).toEqual({ ok: false, error: "not-permitted" });
    expect(batched).toEqual([]);
  });

  // THE OTHER HALF OF "not looser than production", and the one the package deliberately leaves
  // open: `judgeTransition` answers `ok` for a record it holds none of, and `judgeWithdraw` never
  // asks whose row it is — both leave ownership to the rules. On a live page that is right, because
  // the write goes out as the PARTICIPANT and `ownRow` refuses. Here it goes out as the OWNER, so
  // the question is never asked, and a page naming a row it was never shown would be obeyed.
  it("refuses a row this page was never handed, which the rules here would have allowed", async () => {
    // The row exists and is in a status the table can leave. What it is not is in the dataset the
    // page received — the only thing standing between a participant's page and its neighbours' rows.
    docs.store.set(itemsPath, new Map([["q1", { text: "Falcon 9?", state: "draft" }]]));

    const result = await performPreviewIntent(root, asked({ itemId: "someone-elses-row" }));

    expect(result).toEqual({ ok: false, error: "not-in-view" });
    expect(batched).toEqual([]);
  });

  it("names the COLLECTION before the row, so the answer says which declaration to change", async () => {
    // Ordering, pinned: the presence check runs after the package's judgement. A cid the view never
    // declared has no dataset either, so checking presence first would report every one of them as
    // a missing row — and send the author looking for a record instead of for a `collections` list.
    const result = await performPreviewIntent(root, asked({ cid: "votes", itemId: "nothing" }));

    expect(result).toEqual({ ok: false, error: "unknown-collection" });
  });

  // THE PAIRS. Each of these is two documents the rules read together — `getAfter()` on the second
  // — so a host that wrote them singly would be refused with nothing to tell the author about it.
  // Asserted as the WHOLE batch, in order, because a store that kept only final state would pass a
  // host that sent them as two writes.
  describe("the writes that travel in pairs", () => {
    beforeEach(() => {
      writeCollection("bookings", {
        requesterEmail: { type: "email", label: "Email", required: true },
        slot: { type: "string", label: "Slot", required: true },
        handledBy: { type: "email", label: "Handled by" },
        status: { type: "enum", label: "Status", values: ["booked", "approved"] },
      });
      writeCollection("slots", { state: { type: "enum", label: "State", values: ["open", "taken"], required: true } });
      writeApp(bookingApp());
      docs.store.set(bookingsPath, new Map([["roomA-1000", { requesterEmail: OWNER.email, slot: "roomA-1000", status: "booked" }]]));
      docs.store.set(`apps/${AID}/collections/slots/items`, new Map([["roomA-1000", { state: "taken" }]]));
    });

    it("queues the notice in the SAME batch as the move it belongs to", async () => {
      const result = await performPreviewIntent(root, asked({ cid: "bookings", itemId: "roomA-1000", to: "approved" }));

      expect(result).toEqual({ ok: true, mailed: true });
      // `mailAgainst` compares the record's `get()` with its `getAfter()` and requires the status to
      // have MOVED in this write. Update first and queue second and both sides of that comparison
      // are the post-update value — the approval mail could then never be sent at all.
      //
      // The mail document's id is fixed by the rules (`{cid}_{itemId}_{template}`), which is also
      // what makes pressing the button twice queue one notice rather than two.
      expect(batched).toEqual([
        `update ${bookingsPath}/roomA-1000 {"status":"approved"}`,
        `set apps/${AID}/mail/bookings_roomA-1000_approved {"cid":"bookings","itemId":"roomA-1000","to":"${OWNER.email}","template":"approved"}`,
      ]);
    });

    it("takes the row away and puts the slot it was holding back on the grid, in one write", async () => {
      // The PARTICIPANT's page. `withdrawFrom` is the roster tier's — a staff page gets none even
      // where the declaration carries them, because an owner deletes by role through no vocabulary
      // of ours, and offering them this control would refuse for the wrong reason.
      const result = await performPreviewIntent(root, {
        page: { id: "mine", audience: "roster" },
        kind: "withdraw",
        cid: "bookings",
        itemId: "roomA-1000",
      });

      expect(result).toEqual({ ok: true, mailed: false });
      // `deleteWith` requires `getAfter(mirror).state == "open"`, and the mirror's own rule requires
      // its state to match whether the record exists after this write — so a lone delete and a lone
      // reopen are both refused, and there is no commit in which the booking is gone and the grid
      // still says taken.
      expect(batched).toEqual([`delete ${bookingsPath}/roomA-1000`, `update apps/${AID}/collections/slots/items/roomA-1000 {"state":"open"}`]);
    });

    it("acts on a row whose identity is in the document NAME and nowhere else", async () => {
      // `viewer.mine` is built from a LIST, and `idFrom: "auth.uid+field"` has none: the rules grant
      // a submitter the document they can NAME rather than a range of them. So a page finds that row
      // through `view.mine(cid, key)` — live-poll's whole shape — and it is in neither the page's
      // datasets nor `own`. The ask came back `not-in-view` about a row the page had legitimately
      // been handed, and it was ALLOWED on the live page, where the rules answer ownership.
      //
      // The row is read on demand and accepted only if it is the author's own by the same selector
      // the dataset read filters with — which is the question `ownRow` asks.
      writeCollection("votes", {
        questionId: { type: "string", label: "Q" },
        choice: { type: "string", label: "Choice" },
        state: { type: "enum", label: "State", values: ["cast", "withdrawn"] },
      });
      writeApp({
        aid: AID,
        name: "Poll",
        members: { [OWNER.email]: { "*": "owner" } },
        collections: { votes: { submitOnly: true, statusField: "state", transitions: { initial: ["cast"] } }, questions: {} },
        views: [
          { id: "desk", audience: "member", path: "views/desk.html", collections: ["questions"] },
          // The public page draws the QUESTIONS, which is all `public.read` opens — the votes
          // themselves are the one thing it must never list, which is why the row it acts on can
          // only have come from a lookup.
          { id: "public", audience: "public", path: "views/desk.html", collections: ["questions"] },
        ],
        public: {
          enabled: true,
          read: ["questions"],
          submit: {
            votes: {
              // live-poll's shape, exactly: anonymous, and the uid appears NOWHERE in the record —
              // the document NAME is the only place it lives.
              auth: "anonymous",
              createFields: ["questionId", "choice", "state"],
              initialStatus: "cast",
              idFrom: "auth.uid+field",
              idField: "questionId",
              selfTransitions: { cast: ["withdrawn"] },
            },
          },
        },
      });
      docs.store.set(`apps/${AID}/collections/votes/items`, new Map([[`${OWNER.uid}_q1`, { questionId: "q1", choice: "b", state: "cast" }]]));

      const result = await performPreviewIntent(root, {
        page: { id: "public", audience: "public" },
        kind: "transition",
        cid: "votes",
        itemId: `${OWNER.uid}_q1`,
        to: "withdrawn",
      });

      expect(result).toEqual({ ok: true, mailed: false });
      expect(batched).toEqual([`update apps/${AID}/collections/votes/items/${OWNER.uid}_q1 {"state":"withdrawn"}`]);
    });

    it("acts on a row the page could only LOOK UP, when the list was refused", async () => {
      // `viewer.mine` is built from a LIST and `view.mine(cid, key)` is a `get`, so the two do not
      // fail together: the collection can be unlistable for a render while the document itself
      // reads back. The page then draws a control from an answer it really got, and the host
      // refusing it as `not-in-view` is the rendered-and-refused shape this change exists to
      // remove — the live page allows the move, because there the rules answer ownership.
      docs.store.set(bookingsPath, new Map([["roomA-1000", { requesterEmail: OWNER.email, slot: "roomA-1000", status: "booked" }]]));
      docs.denyItemLists = true;

      const result = await performPreviewIntent(root, {
        page: { id: "public", audience: "public" },
        kind: "transition",
        cid: "bookings",
        itemId: "roomA-1000",
        to: "cancelled",
      });

      expect(result).toEqual({ ok: true, mailed: false });
      expect(batched).toEqual([`update ${bookingsPath}/roomA-1000 {"status":"cancelled"}`]);
    });

    it("still refuses a row that is NOT the author's, when only a lookup could reach it", async () => {
      // The same conditions and the other answer. The read on demand asks `ownsRow` — the predicate
      // the dataset read filters with, which is `ownRow` in the rules said in this host's terms — so
      // it cannot be looser than the list it stands in for. It matters here more than anywhere: this
      // write goes out as the app's OWNER, who may touch anything.
      docs.store.set(bookingsPath, new Map([["roomA-1000", { requesterEmail: "someone@else.example", slot: "roomA-1000", status: "booked" }]]));
      docs.denyItemLists = true;

      const result = await performPreviewIntent(root, {
        page: { id: "public", audience: "public" },
        kind: "transition",
        cid: "bookings",
        itemId: "roomA-1000",
        to: "cancelled",
      });

      expect(result).toEqual({ ok: false, error: "not-in-view" });
      expect(batched).toEqual([]);
    });

    it("still refuses a row that is NOT the author's, however it was named", async () => {
      // The other half, and the reason the fallback is a predicate rather than a read: `NOT_IN_VIEW`
      // stands in for the ownership check the rules would have made, because this write goes out as
      // the app's OWNER — who may touch anything. A row belonging to somebody else stays refused.
      docs.store.set(bookingsPath, new Map([["roomA-1000", { requesterEmail: "someone@else.example", slot: "roomA-1000", status: "booked" }]]));

      const result = await performPreviewIntent(root, {
        page: { id: "public", audience: "public" },
        kind: "transition",
        cid: "bookings",
        itemId: "roomA-1000",
        to: "cancelled",
      });

      expect(result).toEqual({ ok: false, error: "not-in-view" });
      expect(batched).toEqual([]);
    });

    it("cancels the author's OWN booking from the public page, as a participant would", async () => {
      // THE ONE THIS CHANGE EXISTS FOR. `selfTransitions` is declared inside `public.submit`, which
      // is the public page's own declaration, and `ownRow` in the rules asks for `authed()` and
      // nothing else — no role, no membership, an anonymous uid will do. So the visitor who booked
      // the slot may cancel it, and the page that took the booking is where they would press it.
      //
      // It was refused here by kind ("not a member page") because the public parent had no
      // `perform` port to reach this with, and on the live page the intent was dropped without an
      // answer at all. Both halves are wired now, and the ask is judged exactly as `/p/`'s is.
      const result = await performPreviewIntent(root, {
        page: { id: "public", audience: "public" },
        kind: "transition",
        cid: "bookings",
        itemId: "roomA-1000",
        to: "cancelled",
      });

      expect(result).toEqual({ ok: true, mailed: false });
      expect(batched).toEqual([`update ${bookingsPath}/roomA-1000 {"status":"cancelled"}`]);
    });

    it("writes the assignee into the field the declaration names", async () => {
      const result = await performPreviewIntent(root, {
        page: { id: "desk", audience: "member" },
        kind: "assign",
        cid: "bookings",
        itemId: "roomA-1000",
        to: OWNER.email,
      });

      expect(result).toEqual({ ok: true, mailed: false });
      expect(batched).toEqual([`update ${bookingsPath}/roomA-1000 {"handledBy":"${OWNER.email}"}`]);
    });

    it("refuses an address nobody on the roster holds an assignable role at", async () => {
      // Writing it would produce a row NOBODY may touch afterwards — the rules require the assignee
      // to hold a role, and no later write could put it right.
      const result = await performPreviewIntent(root, {
        page: { id: "desk", audience: "member" },
        kind: "assign",
        cid: "bookings",
        itemId: "roomA-1000",
        to: "stranger@example.com",
      });

      expect(result).toEqual({ ok: false, error: "unknown-assignee" });
      expect(batched).toEqual([]);
    });
  });

  it("reports what the rules said instead of claiming the record moved", async () => {
    batchFails = true;

    const result = await performPreviewIntent(root, asked());

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain("insufficient permissions");
  });

  it("refuses a withdrawal the declaration never allowed", async () => {
    // `selfDelete` names the statuses a submitter may take their own row away from, and this app
    // names none — so there is no withdrawal to perform, however entitled the reader is otherwise.
    const result = await performPreviewIntent(root, { page: { id: "desk", audience: "member" }, kind: "withdraw", cid: "questions", itemId: "q1" });

    expect(result).toEqual({ ok: false, error: "not-writable" });
    expect(batched).toEqual([]);
  });
});
