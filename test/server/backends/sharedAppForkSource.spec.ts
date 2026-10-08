// @vitest-environment node
//
// `forkable` at publish: the copy a visitor makes from the public page (receptron/mulmoserver#332).
// What publish writes to `config/fork` and `config/fork:view:{id}`, in what order, what it removes,
// and what it refuses.
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { setFirestoreAccessor, setSharedCollectionsSupport, type FirestoreDocs, type FirestoreDoc } from "@mulmoclaude/core/collection/server";
import { initCollectionsBackend } from "../../../server/backends/collections.js";
import { publishSharedApp } from "../../../server/backends/sharedApp/publish.js";
import { unpublishSharedApp } from "../../../server/backends/sharedApp/unpublish.js";
import { makeTempDir } from "../../support/tempDir";
import { fakeServerTimestamp } from "../../support/serverTimestamp.js";

const AID = "app-fork-source";
const OWNER = { uid: "uid-owner", email: "owner@example.com" };
const STAFF = "staff@example.com";
const CONFIG = `apps/${AID}/config`;

/** The store publish writes through, remembering the order of writes. The rules' parts publish
 *  depends on are modelled: `apps/{aid}` unreadable until it exists, and `apps` / `appSlugs`
 *  created only through `set` (the owner check reads the app document). */
class FakeDocs implements FirestoreDocs {
  timestamp = fakeServerTimestamp;
  readonly store = new Map<string, Map<string, Record<string, unknown>>>();
  readonly writes: string[] = [];

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
    this.writes.push(`set ${collectionPath}/${docId}`);
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

  doc = (collectionPath: string, docId: string): Record<string, unknown> | undefined => this.store.get(collectionPath)?.get(docId);
  ids = (collectionPath: string): string[] => [...this.bucket(collectionPath).keys()].sort();
}

let docs = new FakeDocs();
let root = "";

const VOTES_SCHEMA = {
  title: "Votes",
  icon: "how_to_vote",
  primaryKey: "id",
  storage: { type: "firestore" },
  fields: {
    id: { type: "string", label: "ID", primary: true, required: true },
    choice: { type: "enum", label: "Choice", values: ["red", "blue"] },
    status: { type: "enum", label: "Status", values: ["voted"] },
  },
};

const PUBLIC_VIEW = { id: "public", audience: "public", path: "views/vote.html", collections: ["votes"] };
const DESK_VIEW = { id: "desk", audience: "member", path: "views/desk.html", collections: ["votes"] };

const declaration = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  aid: AID,
  name: "Which colour?",
  forkable: true,
  members: { [OWNER.email]: { "*": "owner" }, [STAFF]: { votes: "viewer" } },
  collections: { votes: { submitOnly: true, statusField: "status" } },
  views: [PUBLIC_VIEW, DESK_VIEW],
  public: {
    enabled: true,
    read: ["votes"],
    submit: { votes: { auth: "anonymous", idFrom: "pseudonym", createFields: ["choice", "status"], initialStatus: "voted" } },
  },
  ...extra,
});

const writeApp = (app: Record<string, unknown>): void => writeFileSync(path.join(root, "app.json"), JSON.stringify(app));
const writePage = (name: string, html: string): void => writeFileSync(path.join(root, "views", name), html);
const stamp = { now: () => 1_700_000_000_000, resolveCommit: () => Promise.resolve({ commit: "c0ffee", dirty: false }) };

describe("forkable at publish", () => {
  beforeAll(() => {
    initCollectionsBackend({ workspace: makeTempDir("mt-fork-source-ws-") });
    setSharedCollectionsSupport(true);
    setFirestoreAccessor(() => ({ docs, email: OWNER.email, uid: OWNER.uid }));
  });

  beforeEach(() => {
    docs = new FakeDocs();
    root = makeTempDir("mt-fork-source-");
    mkdirSync(path.join(root, ".claude", "skills", "votes"), { recursive: true });
    writeFileSync(path.join(root, ".claude", "skills", "votes", "schema.json"), JSON.stringify(VOTES_SCHEMA));
    mkdirSync(path.join(root, "views"), { recursive: true });
    writePage("vote.html", "<p>vote here</p>");
    writePage("desk.html", "<p>the tally</p>");
    writeApp(declaration());
  });

  it("writes the source and every page, naming nobody, and says so in the public config", async () => {
    const result = await publishSharedApp(root, stamp);
    expect(result.ok).toBe(true);
    const source = docs.doc(CONFIG, "fork");
    expect(source).toMatchObject({
      protocol: expect.any(String),
      views: ["public", "desk"],
      schemas: { votes: { primaryKey: "id" } },
      form: expect.any(Object),
    });
    expect(source?.app).toMatchObject({ name: "Which colour?", forkable: true });
    const text = JSON.stringify(source);
    expect(text).not.toContain(OWNER.email);
    expect(text).not.toContain(STAFF);
    expect(text).not.toContain(OWNER.uid);
    expect(text).not.toContain(AID);
    expect(docs.doc(CONFIG, "fork:view:public")).toMatchObject({ html: "<p>vote here</p>" });
    expect(docs.doc(CONFIG, "fork:view:desk")).toMatchObject({ html: "<p>the tally</p>" });
    expect(docs.doc(CONFIG, "public")).toMatchObject({ forkable: true });
  });

  it("writes the pages before the source, and both before the app is opened", async () => {
    await publishSharedApp(root, stamp);
    const at = (entry: string): number => docs.writes.indexOf(entry);
    expect(at(`set ${CONFIG}/fork:view:desk`)).toBeLessThan(at(`set ${CONFIG}/fork`));
    expect(at(`set ${CONFIG}/fork:view:public`)).toBeLessThan(at(`set ${CONFIG}/fork`));
    expect(at(`set ${CONFIG}/fork`)).toBeLessThan(docs.writes.lastIndexOf(`set apps/${AID}`));
  });

  it("an app that is not forkable writes no copy, and its public config says nothing", async () => {
    writeApp(declaration({ forkable: undefined }));
    expect((await publishSharedApp(root, stamp)).ok).toBe(true);
    expect(docs.ids(CONFIG).filter((id) => id.startsWith("fork"))).toEqual([]);
    expect(Object.hasOwn(docs.doc(CONFIG, "public") ?? {}, "forkable")).toBe(false);
  });

  it("withdrawing forkable removes the whole copy, the source first", async () => {
    await publishSharedApp(root, stamp);
    writeApp(declaration({ forkable: false }));
    docs.writes.length = 0;
    expect((await publishSharedApp(root, stamp)).ok).toBe(true);
    expect(docs.ids(CONFIG).filter((id) => id.startsWith("fork"))).toEqual([]);
    const deletes = docs.writes.filter((entry) => entry.startsWith(`delete ${CONFIG}/fork`));
    expect(deletes[0]).toBe(`delete ${CONFIG}/fork`);
    expect(deletes).toHaveLength(3);
  });

  it("a page withdrawn from views loses its copy too", async () => {
    await publishSharedApp(root, stamp);
    writeApp(declaration({ views: [PUBLIC_VIEW] }));
    expect((await publishSharedApp(root, stamp)).ok).toBe(true);
    expect(docs.ids(CONFIG).filter((id) => id.startsWith("fork"))).toEqual(["fork", "fork:view:public"]);
    expect(docs.doc(CONFIG, "fork")?.views).toEqual(["public"]);
  });

  it("refuses, before any public write, while a page names somebody on the roster", async () => {
    writePage("desk.html", `<p>questions to ${STAFF}</p>`);
    const result = await publishSharedApp(root, stamp);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.problems.join(" ")).toContain(STAFF);
    expect(docs.ids(CONFIG)).toEqual([]);
    expect(docs.ids(`apps/${AID}/collections`)).toEqual([]);
  });

  it("refuses while a page carries the publisher's uid, which app.json never states", async () => {
    writePage("desk.html", `<p>owner ${OWNER.uid}</p>`);
    const result = await publishSharedApp(root, stamp);
    expect(result.ok).toBe(false);
    expect(docs.ids(CONFIG).filter((id) => id.startsWith("fork"))).toEqual([]);
  });

  it("refuses while a page carries the live app's owner uid, when somebody else publishes", async () => {
    await publishSharedApp(root, stamp);
    const app = docs.doc("apps", AID);
    if (app) app.owner = "uid-first-owner";
    writePage("desk.html", "<p>ask uid-first-owner</p>");
    const result = await publishSharedApp(root, stamp);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.problems.join(" ")).toContain("uid-first-owner");
  });

  it("unpublish takes the copy down with the app, the source first", async () => {
    await publishSharedApp(root, stamp);
    docs.writes.length = 0;
    expect((await unpublishSharedApp(root)).ok).toBe(true);
    expect(docs.ids(CONFIG).filter((id) => id.startsWith("fork"))).toEqual([]);
    const deletes = docs.writes.filter((entry) => entry.startsWith(`delete ${CONFIG}/fork`));
    expect(deletes[0]).toBe(`delete ${CONFIG}/fork`);
    expect(deletes).toHaveLength(3);
  });
});
