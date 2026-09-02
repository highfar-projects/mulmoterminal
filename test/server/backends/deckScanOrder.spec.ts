// @vitest-environment node
// WHICH decks survive the count limit, not merely how the answer is arranged. `readdir` returns
// the filesystem's own order and sorting the result afterwards cannot bring back what was already
// discarded, so the walk has to visit in a known order (Codex on #1950).
//
// Its own file because it MOCKS `readdir` to hand entries back reversed. Asserting this against a
// real directory does not test anything: this machine's filesystem happens to return these names
// in order already, so the same test passed with the ordering removed — a test that cannot fail.
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

vi.mock("node:fs/promises", async (orig) => {
  const actual = await orig<typeof import("node:fs/promises")>();
  return {
    ...actual,
    default: actual,
    readdir: async (...args: Parameters<typeof actual.readdir>) => {
      const entries = await actual.readdir(...args);
      return [...entries].reverse();
    },
  };
});

const { scanDecks, MAX_DECKS } = await import("../../../server/backends/deckScan");

const deck = (title: string) => JSON.stringify({ $mulmocast: { version: "1.1" }, title, beats: [{ text: "a" }] });

describe("the count limit under a filesystem that answers in another order", () => {
  let root = "";
  const names = Array.from({ length: MAX_DECKS + 10 }, (_, i) => `d${String(i).padStart(3, "0")}.json`);

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), "deckorder-"));
    await Promise.all(names.map((name) => writeFile(path.join(root, name), deck(name))));
  });
  afterAll(async () => rm(root, { recursive: true, force: true }));

  it("keeps the first decks BY NAME, not the ones the directory listed first", async () => {
    expect((await scanDecks(root)).map((d) => d.path)).toEqual(names.slice(0, MAX_DECKS));
  });
});
