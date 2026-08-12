// @vitest-environment node
//
// `fork` — taking over a CLONE of somebody else's shared app.
//
// The operation exists because the alternative was a sequence with an irreversible step at the
// front: `init` refuses a repository that already declares an app, so making a clone yours meant
// deleting `app.json` first — and `collections` and `public` went with it. Every property below
// is one half of that: what must come across, and what must not.
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { setFirestoreAccessor, setSharedCollectionsSupport, type FirestoreDocs, type FirestoreDoc } from "@mulmoclaude/core/collection/server";
import { initCollectionsBackend } from "../../../server/backends/collections.js";
import { forkSharedApp } from "../../../server/backends/sharedApp/declare.js";
import { makeTempDir } from "../../support/tempDir";

const ME = { uid: "uid-me", email: "me@example.com" };

/** The app.json a clone arrives with: somebody else's roster, somebody else's aid and URL name,
 *  and the two blocks that describe the collections committed beside it. */
const CLONED = {
  name: "講演アンケート",
  slug: "talk-survey",
  members: {
    "author@example.com": { "*": "owner" },
    "helper@example.com": { "*": "viewer" },
  },
  collections: { responses: { submitOnly: true } },
  public: { enabled: true, read: [], submit: { responses: { auth: "verifiedEmail", emailField: "email", createFields: ["name", "email"] } } },
  aid: "11111111-2222-3333-4444-555555555555",
};

class FakeDocs implements FirestoreDocs {
  readonly store = new Map<string, Record<string, unknown>>();
  readonly writes: string[] = [];
  refuseWrites = false;

  async set(collectionPath: string, id: string, doc: Record<string, unknown>): Promise<void> {
    if (this.refuseWrites) throw Object.assign(new Error("PERMISSION_DENIED: Missing or insufficient permissions."), { code: "permission-denied" });
    this.writes.push(`${collectionPath}/${id}`);
    this.store.set(`${collectionPath}/${id}`, doc);
  }
  async get(collectionPath: string, id: string): Promise<FirestoreDoc | null> {
    const data = this.store.get(`${collectionPath}/${id}`);
    return data === undefined ? null : ({ id, data } as FirestoreDoc);
  }
  async list(): Promise<FirestoreDoc[]> {
    return [];
  }
  async create(collectionPath: string, id: string, doc: Record<string, unknown>): Promise<boolean> {
    await this.set(collectionPath, id, doc);
    return true;
  }
  async delete(): Promise<boolean> {
    return true;
  }
  watch(): () => void {
    return () => {};
  }
}

interface Manifest {
  name?: string;
  slug?: string;
  aid?: string;
  members?: Record<string, Record<string, string>>;
  collections?: unknown;
  public?: unknown;
}

const manifestAt = (root: string): Manifest => JSON.parse(readFileSync(path.join(root, "app.json"), "utf-8")) as Manifest;

describe("forkSharedApp", () => {
  let docs: FakeDocs;
  let root: string;

  beforeAll(() => {
    initCollectionsBackend({ workspace: makeTempDir("mt-fork-ws-") });
    setSharedCollectionsSupport(true);
    setFirestoreAccessor(() => ({ docs, email: ME.email, uid: ME.uid }));
  });

  beforeEach(() => {
    docs = new FakeDocs();
    root = makeTempDir("mt-fork-");
    writeFileSync(path.join(root, "app.json"), `${JSON.stringify(CLONED, null, 2)}\n`);
  });

  it("mints a new aid, makes the signed-in address the only member, and carries the collections over", async () => {
    const result = await forkSharedApp(root, undefined, "my-talk-survey");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.aid).not.toBe(CLONED.aid);
    expect(result.carried).toEqual(["collections", "public"]);

    const written = manifestAt(root);
    expect(written.aid).toBe(result.aid);
    // The roster is REPLACED, not extended: the addresses the cloned declaration listed have no
    // claim on an app they have never heard of.
    expect(written.members).toEqual({ [ME.email]: { "*": "owner" } });
    // And the two blocks that describe the collections beside it come across verbatim.
    expect(written.collections).toEqual(CLONED.collections);
    expect(written.public).toEqual(CLONED.public);
  });

  it("takes the new aid on the server before it reaches app.json", async () => {
    const result = await forkSharedApp(root, undefined, undefined);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // One write, at the NEW id — the cloned app's document is never touched.
    expect(docs.writes).toEqual([`apps/${result.aid}`]);
    expect(docs.store.has(`apps/${CLONED.aid}`)).toBe(false);
    const doc = docs.store.get(`apps/${result.aid}`);
    expect(Object.keys(doc ?? {}).sort()).toEqual(["memberEmails", "members", "owner"]);
    expect(doc?.owner).toBe(ME.uid);
    expect(doc?.memberEmails).toEqual([ME.email]);
  });

  // A carried slug would not be refused — it would be honoured as a WISH and come back numbered,
  // which is a URL derived from somebody else's app name that nobody chose.
  it("drops the cloned URL name rather than wishing for it, and reports the one it dropped", async () => {
    const result = await forkSharedApp(root, undefined, undefined);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.previousSlug).toBe(CLONED.slug);
    expect(result.slug).toBeUndefined();
    expect(manifestAt(root).slug).toBeUndefined();
  });

  it("carries the name when none is given, and takes the given one when there is", async () => {
    expect(manifestAt(root).name).toBe(CLONED.name);
    await forkSharedApp(root, undefined, undefined);
    expect(manifestAt(root).name).toBe(CLONED.name);

    const second = makeTempDir("mt-fork-");
    writeFileSync(path.join(second, "app.json"), `${JSON.stringify(CLONED, null, 2)}\n`);
    await forkSharedApp(second, "My own survey", undefined);
    expect(manifestAt(second).name).toBe("My own survey");
  });

  // The refusal this operation is most dangerous without: run against your OWN app it would not
  // fork anything — it would mint a second aid and abandon the first, records and all, with
  // nothing on disk saying so.
  it("refuses when the signed-in address already owns the app, without touching Firestore", async () => {
    writeFileSync(path.join(root, "app.json"), JSON.stringify({ ...CLONED, members: { [ME.email]: { "*": "owner" } } }, null, 2));

    const result = await forkSharedApp(root, undefined, undefined);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    const said = result.problems.join(" ");
    expect(said).toContain("There is nothing to fork");
    expect(said).toContain(`apps/${CLONED.aid}`);
    expect(docs.writes).toEqual([]);
    // Untouched: the aid is still the one it was.
    expect(manifestAt(root).aid).toBe(CLONED.aid);
  });

  it("refuses a repository that declares no app at all, and points at init", async () => {
    const empty = makeTempDir("mt-fork-empty-");

    const result = await forkSharedApp(empty, undefined, undefined);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.problems.join(" ")).toContain("`init`");
    expect(docs.writes).toEqual([]);
  });

  // Nothing is half-done: a refused reservation must leave the clone exactly as it was, so the
  // author still has the declaration they cloned and can simply run `fork` again.
  it("leaves the cloned declaration in place when the reservation is refused", async () => {
    docs.refuseWrites = true;

    const result = await forkSharedApp(root, undefined, "my-talk-survey");

    expect(result.ok).toBe(false);
    expect(!result.ok && result.problems.join(" ")).toContain("cannot reserve the app");
    expect(manifestAt(root)).toEqual(CLONED);
  });
});
