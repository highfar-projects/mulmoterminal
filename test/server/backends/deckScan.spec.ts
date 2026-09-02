// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { scanDecks, isSkippedDir, isDeckObject, deckLabel, byPath, MAX_DEPTH, MAX_DECKS, MAX_DECK_BYTES } from "../../../server/backends/deckScan";

const deck = (title?: string) => JSON.stringify({ $mulmocast: { version: "1.1" }, ...(title === undefined ? {} : { title }), beats: [{ text: "a" }] });

describe("what counts as a deck", () => {
  // The reason the extension is not the test: a repository's `.json` files are overwhelmingly
  // configuration, and a menu listing `package.json` is worse than no menu.
  it("takes the marker, not the extension", () => {
    expect(isDeckObject(JSON.parse(deck()))).toBe(true);
    expect(isDeckObject({ name: "mulmoterminal", version: "4.14.0" })).toBe(false);
    expect(isDeckObject({ compilerOptions: {} })).toBe(false);
  });

  // A JSON file can hold anything, and a scanner that assumes an object crashes on the first
  // array or bare string it meets.
  it("refuses everything that is not an object carrying the marker", () => {
    [null, undefined, 42, "text", [], [{ $mulmocast: {} }], true].forEach((value) => expect(isDeckObject(value)).toBe(false));
  });

  it("names a deck by its title, and falls back to the file the user made", () => {
    expect(deckLabel(JSON.parse(deck("Launch talk")), "talk.json")).toBe("Launch talk");
    expect(deckLabel(JSON.parse(deck()), "talk.json")).toBe("talk.json");
    // Whitespace is not a name: it renders as a blank row that cannot be told from the others.
    expect(deckLabel({ $mulmocast: {}, title: "   " }, "talk.json")).toBe("talk.json");
    expect(deckLabel({ $mulmocast: {}, title: 7 }, "talk.json")).toBe("talk.json");
  });

  it("skips the directories that cannot hold one, and every dotted one but our own", () => {
    ["node_modules", ".git", "dist", "lib", "build", "out", "coverage", ".next"].forEach((d) => expect(isSkippedDir(d)).toBe(true));
    expect(isSkippedDir(".anything-hidden")).toBe(true);
    // The exception: a repo keeps its per-directory config here, and a deck beside it is ordinary.
    expect(isSkippedDir(".mulmoterminal")).toBe(false);
    ["decks", "docs", "src", "artifacts"].forEach((d) => expect(isSkippedDir(d)).toBe(false));
  });

  // The order is part of what the server answers. `localeCompare` would make it depend on the
  // machine's locale, so two people listing one repository could see two orders.
  it("orders by code unit, not by locale", () => {
    expect(
      ["b.json", "A.json", "a.json"]
        .map((p) => ({ path: p, label: p }))
        .sort(byPath)
        .map((d) => d.path),
    ).toEqual(["A.json", "a.json", "b.json"]);
  });
});

describe("scanning a directory", () => {
  let root = "";

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), "deckscan-"));
    await mkdir(path.join(root, "decks"), { recursive: true });
    await mkdir(path.join(root, "node_modules", "pkg"), { recursive: true });
    await mkdir(path.join(root, "a", "b", "c", "d", "e"), { recursive: true });
    await writeFile(path.join(root, "top.json"), deck("Top"));
    await writeFile(path.join(root, "decks", "talk.json"), deck("Launch talk"));
    await writeFile(path.join(root, "decks", "untitled.json"), deck());
    await writeFile(path.join(root, "package.json"), JSON.stringify({ name: "x" }));
    await writeFile(path.join(root, "broken.json"), "{ not json");
    await writeFile(path.join(root, "node_modules", "pkg", "sample.json"), deck("Vendored"));
    // Deeper than MAX_DEPTH: a deck kept for a person to find is not five directories down.
    await writeFile(path.join(root, "a", "b", "c", "d", "e", "deep.json"), deck("Too deep"));
    await writeFile(path.join(root, "a", "b", "shallow.json"), deck("In reach"));
  });
  afterAll(async () => rm(root, { recursive: true, force: true }));

  it("finds the decks and nothing else", async () => {
    const found = await scanDecks(root);
    expect(found.map((d) => d.label).sort()).toEqual(["In reach", "Launch talk", "Top", "untitled.json"]);
  });

  it("leaves out configuration, unparseable files and vendored trees", async () => {
    const paths = (await scanDecks(root)).map((d) => d.path);
    expect(paths.some((p) => p.includes("package.json"))).toBe(false);
    expect(paths.some((p) => p.includes("broken"))).toBe(false);
    expect(paths.some((p) => p.includes("node_modules"))).toBe(false);
  });

  it("stops at the depth limit", async () => {
    expect((await scanDecks(root)).some((d) => d.label === "Too deep")).toBe(false);
  });

  it("answers paths relative to what it was asked about", async () => {
    const found = await scanDecks(root);
    expect(found.map((d) => d.path)).toContain(path.join("decks", "talk.json"));
    expect(found.every((d) => !path.isAbsolute(d.path))).toBe(true);
  });

  // An unreadable directory must cost that directory, not the menu: a listing that throws leaves
  // the button hidden and gives the user nothing to act on.
  it("answers for a directory that does not exist at all", async () => {
    expect(await scanDecks(path.join(root, "no-such-place"))).toEqual([]);
  });
});

describe("the bounds are stated, not incidental", () => {
  // These are the design's numbers (#1948). A change to them is a decision about cost, so it
  // should have to come through here rather than through a silent edit.
  it("keeps the documented limits", () => {
    expect(MAX_DEPTH).toBe(4);
    expect(MAX_DECKS).toBe(50);
    expect(MAX_DECK_BYTES).toBe(2 * 1024 * 1024);
  });

  it("stops at the count limit", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "deckmany-"));
    try {
      await Promise.all(Array.from({ length: MAX_DECKS + 10 }, (_, i) => writeFile(path.join(root, `d${String(i).padStart(3, "0")}.json`), deck(`D${i}`))));
      expect(await scanDecks(root)).toHaveLength(MAX_DECKS);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  // Read whole to be parsed, so the ceiling is what keeps a huge file from being read at all.
  it("skips a file past the size ceiling", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "deckbig-"));
    try {
      const padded = JSON.stringify({ $mulmocast: { version: "1.1" }, title: "Huge", pad: "x".repeat(MAX_DECK_BYTES) });
      await writeFile(path.join(root, "huge.json"), padded);
      await writeFile(path.join(root, "small.json"), deck("Small"));
      expect((await scanDecks(root)).map((d) => d.label)).toEqual(["Small"]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
