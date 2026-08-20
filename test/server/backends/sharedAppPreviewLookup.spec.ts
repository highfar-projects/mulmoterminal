// @vitest-environment node
//
// "Have I already got this row?", answered in the preview — the half `viewer.mine` cannot cover.
//
// `mine` rides with the state and can only carry what can be LISTED. For `idFrom: "auth.uid+field"`
// the ids are `uid + "_" + <field>` and the rules grant a submitter the document they can NAME
// rather than a range of them, so nothing can be listed ahead of time: the page holds the key and
// asks.
//
// What is pinned here is the shape of the answers, because two of them look alike and mean opposite
// things. `{ ok: false }` is "nobody looked" — the parent turns it into `known: false`, and the page
// keeps offering the action. `{ ok: true, found: false }` is "you have not answered". A host that
// collapses the first into the second takes a one-time action away from somebody entitled to it.
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { setFirestoreAccessor, setSharedCollectionsSupport, type FirestoreDocs, type FirestoreDoc } from "@mulmoclaude/core/collection/server";
import { initCollectionsBackend } from "../../../server/backends/collections.js";
import { previewOwnLookup } from "../../../server/backends/sharedApp/previewLookup.js";
import { makeTempDir } from "../../support/tempDir";

const AID = "app-under-lookup";
const OWNER = { uid: "uid-owner", email: "owner@example.com" };

class Docs implements FirestoreDocs {
  readonly store = new Map<string, Map<string, Record<string, unknown>>>();
  /** Refuse the read, as the rules do for an app nobody has published. */
  denyItemReads = false;

  private read(collectionPath: string): Map<string, Record<string, unknown>> {
    return this.store.get(collectionPath) ?? new Map();
  }

  list = (collectionPath: string): Promise<FirestoreDoc[]> =>
    Promise.resolve([...this.read(collectionPath)].sort(([l], [r]) => (l < r ? -1 : 1)).map(([id, data]) => ({ id, data })));

  get = (collectionPath: string, docId: string): Promise<unknown | null> => {
    if (this.denyItemReads && collectionPath.includes("/collections/")) {
      return Promise.reject(Object.assign(new Error("Missing or insufficient permissions."), { code: "permission-denied" }));
    }
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

/** A poll: one answer per person per question, which is the id strategy `mine` cannot list. */
const pollApp = (over: Record<string, unknown> = {}) => ({
  aid: AID,
  name: "Poll",
  members: { [OWNER.email]: { "*": "owner" } },
  collections: { votes: { submitOnly: true } },
  public: {
    enabled: true,
    read: [],
    submit: {
      votes: {
        auth: "anonymous",
        uidField: "uid",
        createFields: ["uid", "questionId", "choice"],
        idFrom: "auth.uid+field",
        idField: "questionId",
      },
    },
    ...over,
  },
});

const votesPath = `apps/${AID}/collections/votes/items`;

describe("looking up one of the author's own rows", () => {
  beforeAll(() => {
    initCollectionsBackend({ workspace: makeTempDir("mt-lookup-ws-") });
    setSharedCollectionsSupport(true);
    setFirestoreAccessor(() => ({ docs, email: OWNER.email, uid: OWNER.uid }));
  });

  beforeEach(() => {
    docs = new Docs();
    root = makeTempDir("mt-lookup-");
    writeCollection("votes", {
      uid: { type: "string", label: "Uid" },
      questionId: { type: "string", label: "Question" },
      choice: { type: "string", label: "Choice" },
    });
    writeFileSync(path.join(root, "app.json"), JSON.stringify(pollApp()));
    docs.store.set("apps", new Map([[AID, { owner: OWNER.uid, members: { [OWNER.email]: { "*": "owner" } }, memberEmails: [OWNER.email] }]]));
  });

  it("builds the id the SUBMISSION would have written, and projects what it finds", async () => {
    docs.store.set(votesPath, new Map([[`${OWNER.uid}_q1`, { uid: OWNER.uid, questionId: "q1", choice: "b", countedAt: "2026-08-19" }]]));

    const answer = await previewOwnLookup(root, { cid: "votes", key: "q1" });

    // The id is `recordId`'s, not a second copy of the rule: a lookup that named a different
    // document would tell the page "no row" about a row it is about to be refused for.
    //
    // `countedAt` is the app's and does not cross into the sandbox; `uid` is host-filled and does
    // not either. What is left is the id and what the page could have sent.
    expect(answer).toEqual({ ok: true, found: true, record: { id: `${OWNER.uid}_q1`, questionId: "q1", choice: "b" } });
  });

  it("says 'you have not answered' when the row is genuinely not there", async () => {
    const answer = await previewOwnLookup(root, { cid: "votes", key: "q2" });

    expect(answer).toEqual({ ok: true, found: false });
  });

  it("says NOBODY LOOKED when the read was refused", async () => {
    // Not `found: false`. A refused read is the ordinary state of an app that has never been
    // published, and a page told "no" there stops offering an action to somebody entitled to it.
    docs.denyItemReads = true;

    expect(await previewOwnLookup(root, { cid: "votes", key: "q1" })).toEqual({ ok: false });
  });

  it("says nobody looked for a collection whose id cannot be built from a key", async () => {
    // `auto` has no id anything can name, and `field` names a record the page did not create —
    // which is a different question from "mine".
    writeFileSync(
      path.join(root, "app.json"),
      JSON.stringify(pollApp({ submit: { votes: { auth: "anonymous", uidField: "uid", createFields: ["uid", "questionId", "choice"] } } })),
    );

    expect(await previewOwnLookup(root, { cid: "votes", key: "q1" })).toEqual({ ok: false });
  });

  it("says nobody looked for a collection the app never opened", async () => {
    expect(await previewOwnLookup(root, { cid: "nothing-here", key: "q1" })).toEqual({ ok: false });
  });
});
