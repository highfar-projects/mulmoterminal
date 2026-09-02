// @vitest-environment node
// The Mulmo menu's two sources (#1948). There is no search here and the reason is the point: the
// first design walked the workspace for anything that parsed as a mulmoScript, and in one real
// workspace that found 250 of them — 33 the user's own, 217 a checked-out repository's test
// fixtures and samples. So the sources are named, and these tests pin which.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { listDecks, isDeckObject, deckLabel, byLabel, byName, STORIES_DIR, MAX_DECKS, MAX_DECK_BYTES, MAX_CANDIDATES } from "../../../server/backends/deckList";

const deck = (title?: string) => JSON.stringify({ $mulmocast: { version: "1.1" }, ...(title === undefined ? {} : { title }), beats: [{ text: "a" }] });

describe("what counts as a deck", () => {
  // A declared path that is not a deck is dropped rather than offered: the menu would open it and
  // the server would refuse, which is the dead button this whole area exists to remove.
  it("takes the marker, not the extension", () => {
    expect(isDeckObject(JSON.parse(deck()))).toBe(true);
    expect(isDeckObject({ name: "mulmoterminal", version: "4.14.0" })).toBe(false);
    [null, undefined, 42, "text", [], [{ $mulmocast: {} }], true].forEach((value) => expect(isDeckObject(value)).toBe(false));
  });

  it("names a deck by its title, and falls back to the file the user made", () => {
    expect(deckLabel(JSON.parse(deck("Launch talk")), "talk.json")).toBe("Launch talk");
    expect(deckLabel(JSON.parse(deck()), "talk.json")).toBe("talk.json");
    // Whitespace is not a name: it renders as a blank row that cannot be told from the others.
    expect(deckLabel({ $mulmocast: {}, title: "   " }, "talk.json")).toBe("talk.json");
    expect(deckLabel({ $mulmocast: {}, title: 7 }, "talk.json")).toBe("talk.json");
  });

  // The order is part of what the server answers, so it must not depend on the machine's locale.
  it("orders by label in code-unit order, and breaks ties by path", () => {
    const rows = [
      { path: "/w/b.json", label: "B" },
      { path: "/w/a2.json", label: "A" },
      { path: "/w/a1.json", label: "A" },
    ];
    expect([...rows].sort(byLabel).map((d) => d.path)).toEqual(["/w/a1.json", "/w/a2.json", "/w/b.json"]);
  });
});

describe("where the decks come from", () => {
  let ws = "";
  let repo = "";

  beforeAll(async () => {
    ws = await mkdtemp(path.join(tmpdir(), "decklist-"));
    repo = path.join(ws, "myrepo");
    await mkdir(path.join(ws, STORIES_DIR), { recursive: true });
    await mkdir(path.join(repo, "decks"), { recursive: true });
    await mkdir(path.join(ws, "vendored", "someone-else", "test"), { recursive: true });
    await writeFile(path.join(ws, STORIES_DIR, "agent-made.json"), deck("Agent made"));
    await writeFile(path.join(ws, STORIES_DIR, "notes.txt"), "not json");
    await writeFile(path.join(repo, "decks", "launch.json"), deck("Launch talk"));
    await writeFile(path.join(repo, "decks", "not-a-deck.json"), JSON.stringify({ compilerOptions: {} }));
    // The 217-of-250 case: a checked-out repository's fixtures, which a search would have offered.
    await writeFile(path.join(ws, "vendored", "someone-else", "test", "fixture.json"), deck("Someone else's fixture"));
  });
  afterAll(async () => rm(ws, { recursive: true, force: true }));

  it("offers the workspace's own stories directory without anyone declaring it", async () => {
    expect((await listDecks(ws, repo, [])).map((d) => d.label)).toEqual(["Agent made"]);
  });

  it("adds the decks this directory declared, by a path relative to it", async () => {
    const found = await listDecks(ws, repo, ["decks/launch.json"]);
    expect(found.map((d) => d.label)).toEqual(["Agent made", "Launch talk"]);
    // ABSOLUTE: the two sources have different roots, so a relative answer would need a base the
    // browser cannot know.
    expect(found.every((d) => path.isAbsolute(d.path))).toBe(true);
    expect(found.find((d) => d.label === "Launch talk")?.path).toBe(path.join(repo, "decks", "launch.json"));
  });

  // The finding that killed the search, as a test: nothing reaches the menu because it happens to
  // be on disk and parse.
  it("never offers a deck nobody named", async () => {
    const found = await listDecks(ws, repo, ["decks/launch.json"]);
    expect(found.map((d) => d.label)).not.toContain("Someone else's fixture");
  });

  it("drops a declared path that is not a deck, and one that is not there at all", async () => {
    const found = await listDecks(ws, repo, ["decks/not-a-deck.json", "decks/missing.json", "decks/launch.json"]);
    expect(found.map((d) => d.label)).toEqual(["Agent made", "Launch talk"]);
  });

  it("does not offer the same deck twice when a declaration names one from the stories directory", async () => {
    const found = await listDecks(ws, repo, [path.join(ws, STORIES_DIR, "agent-made.json")]);
    expect(found.map((d) => d.label)).toEqual(["Agent made"]);
  });

  it("answers for a workspace with no stories directory at all", async () => {
    const empty = await mkdtemp(path.join(tmpdir(), "decklist-empty-"));
    try {
      expect(await listDecks(empty, empty, [])).toEqual([]);
    } finally {
      await rm(empty, { recursive: true, force: true });
    }
  });
});

describe("the bounds that are left", () => {
  // Two, where the search needed five. Both are about what a MENU should be, not about surviving
  // a repository's shape.
  it("keeps the documented limits", () => {
    expect(MAX_DECKS).toBe(50);
    expect(MAX_DECK_BYTES).toBe(2 * 1024 * 1024);
    expect(MAX_CANDIDATES).toBe(200);
  });

  it("orders names in code-unit order, not the machine's locale", () => {
    expect(["b", "A", "a", "B"].sort(byName)).toEqual(["A", "B", "a", "b"]);
  });

  // The cap is applied to the NAMES, before anything is opened: reading a stories directory grown
  // to hundreds only to discard most of them is work nobody asked for, and it is all `Promise.all`
  // so they open at once (Codex on #1950).
  //
  // Laid out so "capped before reading" and "capped after reading" cannot agree — the titles run in
  // the OPPOSITE order to the file names, so choosing by file name keeps the LAST titles, and
  // reading everything and choosing by title would keep the first.
  it("stops at the count limit, having opened only that many", async () => {
    const ws = await mkdtemp(path.join(tmpdir(), "deckcap-"));
    const total = MAX_DECKS + 10;
    try {
      await mkdir(path.join(ws, STORIES_DIR), { recursive: true });
      await Promise.all(
        Array.from({ length: total }, (_, i) =>
          writeFile(path.join(ws, STORIES_DIR, `d${String(i).padStart(3, "0")}.json`), deck(`T${String(total - 1 - i).padStart(3, "0")}`)),
        ),
      );
      const found = await listDecks(ws, ws, []);
      expect(found).toHaveLength(MAX_DECKS);
      expect(found[0]?.label).toBe(`T${String(total - MAX_DECKS).padStart(3, "0")}`);
      expect(found.at(-1)?.label).toBe(`T${String(total - 1).padStart(3, "0")}`);
    } finally {
      await rm(ws, { recursive: true, force: true });
    }
  });

  // A stories directory is where a half-written artifact turns up, and JSON that is stale,
  // malformed or simply not a deck costs a read and yields nothing. Capping the file NAMES at the
  // deck limit would let a run of those early in the alphabet hide every real deck behind them
  // (Codex on #1950).
  it("looks past junk early in the alphabet to find the decks behind it", async () => {
    const ws = await mkdtemp(path.join(tmpdir(), "deckjunk-"));
    try {
      const dir = path.join(ws, STORIES_DIR);
      await mkdir(dir, { recursive: true });
      // MORE junk than the deck limit, all of it sorted first — which is what makes this the bug:
      // capping the file NAMES at that limit takes only junk and answers "no decks". Malformed,
      // not-a-deck and oversized are all represented, since each fails at a different step.
      await Promise.all(
        Array.from({ length: MAX_DECKS }, (_, i) =>
          writeFile(path.join(dir, `aa${String(i).padStart(3, "0")}.json`), i % 2 === 0 ? "{ not json" : JSON.stringify({ compilerOptions: {} })),
        ),
      );
      await writeFile(path.join(dir, "ab-huge.json"), JSON.stringify({ $mulmocast: {}, title: "Huge", pad: "x".repeat(MAX_DECK_BYTES) }));
      await writeFile(path.join(dir, "zzz-real.json"), deck("The real one"));
      expect((await listDecks(ws, ws, [])).map((d) => d.label)).toEqual(["The real one"]);
    } finally {
      await rm(ws, { recursive: true, force: true });
    }
  });

  // …but looking past junk needs its own ceiling, or a directory full of it is read in full.
  it("gives up looking after the candidate ceiling", async () => {
    const ws = await mkdtemp(path.join(tmpdir(), "deckceiling-"));
    try {
      const dir = path.join(ws, STORIES_DIR);
      await mkdir(dir, { recursive: true });
      await Promise.all(Array.from({ length: MAX_CANDIDATES }, (_, i) => writeFile(path.join(dir, `a${String(i).padStart(4, "0")}.json`), "{ not json")));
      await writeFile(path.join(dir, "zzz-real.json"), deck("Behind the ceiling"));
      expect(await listDecks(ws, ws, [])).toEqual([]);

      // The control: one fewer junk file and the same deck IS found, so the empty answer is the
      // ceiling rather than something else about the directory.
      await rm(path.join(dir, "a0000.json"));
      expect((await listDecks(ws, ws, [])).map((d) => d.label)).toEqual(["Behind the ceiling"]);
    } finally {
      await rm(ws, { recursive: true, force: true });
    }
  });

  it("skips a file past the size ceiling", async () => {
    const ws = await mkdtemp(path.join(tmpdir(), "deckbig-"));
    try {
      await mkdir(path.join(ws, STORIES_DIR), { recursive: true });
      await writeFile(
        path.join(ws, STORIES_DIR, "huge.json"),
        JSON.stringify({ $mulmocast: { version: "1.1" }, title: "Huge", pad: "x".repeat(MAX_DECK_BYTES) }),
      );
      await writeFile(path.join(ws, STORIES_DIR, "small.json"), deck("Small"));
      expect((await listDecks(ws, ws, [])).map((d) => d.label)).toEqual(["Small"]);
    } finally {
      await rm(ws, { recursive: true, force: true });
    }
  });
});
