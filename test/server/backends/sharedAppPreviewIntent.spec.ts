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
  serverTimestamp: () => ({ __serverTimestamp: true }),
  doc: (parent: { collectionPath: string }, docId: string) => ({ path: `${parent.collectionPath}/${docId}` }),
  writeBatch: () => {
    const ops: string[] = [];
    return {
      set: (ref: { path: string }, data: Record<string, unknown>) => ops.push(`set ${ref.path} ${JSON.stringify(data)}`),
      update: (ref: { path: string }, data: Record<string, unknown>) => ops.push(`update ${ref.path} ${JSON.stringify(data)}`),
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

  list = (collectionPath: string): Promise<FirestoreDoc[]> =>
    Promise.resolve([...this.read(collectionPath)].sort(([l], [r]) => (l < r ? -1 : 1)).map(([id, data]) => ({ id, data })));

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

const itemsPath = `apps/${AID}/collections/questions/items`;

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

  it("refuses an intent that arrives from a public page", async () => {
    // A public page has no reader and no roles, so there is nothing to judge the move AS. Answered
    // by name rather than performed as somebody.
    const result = await performPreviewIntent(root, asked({ page: { id: "public", audience: "public" } }));

    expect(result).toEqual({ ok: false, error: "not-a-member-page" });
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
