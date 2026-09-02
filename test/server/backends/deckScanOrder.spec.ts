// @vitest-environment node
// WHICH decks survive the count limit, not merely how the answer is arranged. `readdir` returns
// the filesystem's own order and sorting the result afterwards cannot bring back what was already
// discarded, so the walk has to visit in a known order (Codex on #1950).
//
// Its own file because it MOCKS `readdir` to hand entries back reversed. Asserting this against a
// real directory does not test anything: this machine's filesystem happens to return these names
// in order already, so the same test passed with the ordering removed — a test that cannot fail.
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
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

// The rule the cap enforces is SHALLOWER FIRST, then by path. With a limit on how many can be
// shown, a deck one directory down is worth more than one four directories down, whatever their
// names — and "files, then all the way into the first subdirectory, then the next" does not give
// that (Codex on #1950).
//
// Laid out so the two orders CANNOT agree: 45 decks in `aaa/` (depth 1), 20 more in `aaa/deep/`
// (depth 2), 10 in `zzz/` (depth 1), cap 50. Level order takes all of `aaa/` and then 5 from
// `zzz/`; depth-first takes all of `aaa/` and then 5 from `aaa/deep/`, never reaching `zzz/`.
describe("what the count limit gives up", () => {
  let root = "";
  const decksIn = (dir: string, n: number, tag: string) =>
    Array.from({ length: n }, (_, i) => writeFile(path.join(dir, `${tag}${String(i).padStart(3, "0")}.json`), deck(`${tag} ${i}`)));

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), "deckdepth-"));
    await mkdir(path.join(root, "aaa", "deep"), { recursive: true });
    await mkdir(path.join(root, "zzz"), { recursive: true });
    await Promise.all([
      ...decksIn(path.join(root, "aaa"), 45, "a"),
      ...decksIn(path.join(root, "aaa", "deep"), 20, "d"),
      ...decksIn(path.join(root, "zzz"), 10, "z"),
    ]);
  });
  afterAll(async () => rm(root, { recursive: true, force: true }));

  it("spends the last of the limit on the shallower directory, not on the deeper one it was already in", async () => {
    const found = await scanDecks(root);
    expect(found).toHaveLength(MAX_DECKS);
    const depths = found.map((d) => d.path.split(path.sep).length);
    expect(Math.max(...depths)).toBe(2); // nothing from `aaa/deep`
    expect(found.filter((d) => d.path.startsWith(`zzz${path.sep}`))).toHaveLength(5);
  });
});
