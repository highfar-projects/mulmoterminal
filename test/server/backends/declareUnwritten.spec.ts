// @vitest-environment node
//
// `init` and `fork` share the refusal for a write that failed AFTER the aid was reserved, and the
// two must still say different things: after `fork`, app.json is the app this was cloned from, and
// the retry is `fork`, never `init` (which would refuse that repository).
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { chmodSync, writeFileSync } from "node:fs";
import path from "node:path";
import { setFirestoreAccessor, setSharedCollectionsSupport, type FirestoreDocs, type FirestoreDoc } from "@mulmoclaude/core/collection/server";
import { initCollectionsBackend } from "../../../server/backends/collections.js";
import { forkSharedApp, initSharedApp } from "../../../server/backends/sharedApp/declare.js";
import { makeTempDir } from "../../support/tempDir";
import { fakeServerTimestamp } from "../../support/serverTimestamp.js";

const ME = { uid: "uid-me", email: "me@example.com" };
const READ_ONLY_DIR = 0o555;
const WRITABLE_DIR = 0o755;

class FakeDocs implements FirestoreDocs {
  timestamp = fakeServerTimestamp;
  readonly writes: string[] = [];
  async set(collectionPath: string, id: string): Promise<void> {
    this.writes.push(`${collectionPath}/${id}`);
  }
  async get(): Promise<FirestoreDoc | null> {
    return null;
  }
  async list(): Promise<FirestoreDoc[]> {
    return [];
  }
  async create(collectionPath: string, id: string): Promise<boolean> {
    await this.set(collectionPath, id);
    return true;
  }
  async delete(): Promise<boolean> {
    return true;
  }
  watch(): () => void {
    return () => {};
  }
}

const CLONED = { name: "Survey", members: { "author@example.com": { "*": "owner" } }, aid: "11111111-2222-3333-4444-555555555555" };

let docs: FakeDocs;

beforeAll(() => {
  initCollectionsBackend({ workspace: makeTempDir("mt-unwritten-ws-") });
  setSharedCollectionsSupport(true);
  setFirestoreAccessor(() => ({ docs, email: ME.email, uid: ME.uid }));
});

beforeEach(() => {
  docs = new FakeDocs();
});

describe("a manifest write that fails after the reservation", () => {
  it("init: partial, names the reserved aid, and says to run init again", async () => {
    const result = await initSharedApp(path.join(makeTempDir("mt-unwritten-"), "missing"), undefined, undefined);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.partial).toBe(true);
    const said = result.problems.join("\n");
    expect(said).toContain(`${docs.writes[0]}) and is owned by this address, but it never reached app.json.`);
    expect(said).toContain("run `init` again");
    expect(said).not.toContain("cloned from");
  });

  // A read-only directory is how the write is made to fail, and Windows ignores POSIX mode bits.
  it.skipIf(process.platform === "win32")("fork: partial, names the reserved aid, says app.json is still the clone, and to run fork again", async () => {
    const root = makeTempDir("mt-unwritten-");
    writeFileSync(path.join(root, "app.json"), JSON.stringify(CLONED, null, 2));
    chmodSync(root, READ_ONLY_DIR);
    const result = await forkSharedApp(root, undefined, undefined).finally(() => chmodSync(root, WRITABLE_DIR));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.partial).toBe(true);
    const said = result.problems.join("\n");
    expect(said).toContain(
      `${docs.writes[0]}) and is owned by this address, but it never reached app.json — which still declares the app this repository was cloned from.`,
    );
    expect(said).toContain("run `fork` again");
    expect(said).not.toContain("run `init` again");
  });
});
