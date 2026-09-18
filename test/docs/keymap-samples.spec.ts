// @vitest-environment node
//
// Every `keymap` sample this repo ships, run through the validator the server runs at startup.
//
// `CLAUDE.md` already required this — *"any config sample is run through its real validator"* — and
// it held only as long as someone remembered. In #2127 nobody did: the guide was handing readers
// `"next-attention": "Cmd+Shift+A"` in both languages, the exact spelling the section below it
// describes as dead on macOS. A bot found it, from outside the diff.
//
// WARNINGS FAIL HERE, not just errors. `Cmd+Shift+A` parses, loads, and shows in Settings as bound;
// a warning is the only thing that ever says otherwise, so treating warnings as noise would leave
// exactly the hole this closes.
//
// DATED RELEASE PAGES ARE INCLUDED, and that is a decision worth stating. `CLAUDE.md` says never to
// edit an old dated page to match new behaviour — but that is about prose describing what a release
// did. A json block is not a description; it is a thing a reader copies, and the day a release ships
// its page is what they copy from. Every dated sample passes today. If a rule ever tightens and an
// old one trips, decide then — fix that sample, or exclude that page here with the reason — rather
// than dropping warnings to make this quiet.
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { keymapSampleProblems, keymapSamples, sampleShape } from "../support/keymapSamples.js";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// Enumerated from the directory, never typed out: a hand-typed list silently drops a page, and the
// check written from the same list agrees with it (CLAUDE.md, on renumbering `nav_order`).
const guidePages = (): string[] => {
  const root = path.join(REPO, "docs", "guide");
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((language) =>
      readdirSync(path.join(root, language.name))
        .filter((file) => file.endsWith(".md"))
        .map((file) => path.posix.join("docs", "guide", language.name, file)),
    );
};

// The skills are shipped to end users' agents, so a dead sample in one is a dead binding written
// into somebody's config by a machine that believed it.
const skillPages = (): string[] => {
  const root = path.join(REPO, "server", "skills");
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((skill) => path.posix.join("server", "skills", skill.name, "SKILL.md"))
    .filter((relative) => existsSync(path.join(REPO, relative)));
};

const PAGES = [...guidePages(), ...skillPages()].sort();
const read = (relative: string): string => readFileSync(path.join(REPO, relative), "utf8");

// Filtered at COLLECTION time, so the report names the pages that actually ship a sample instead of
// two hundred rows saying nothing. A page that gains one joins this list by itself — the directory
// is walked above, never a list somebody maintains.
const PAGES_WITH_SAMPLES = PAGES.filter((relative) => keymapSamples(read(relative)).length > 0);

// The living reference pages. If one of these stops yielding a sample, the extractor broke —
// a floor alone would still pass while another page grew to cover the loss.
const ALWAYS_CARRY_A_SAMPLE = ["docs/guide/en/config.md", "docs/guide/ja/config.md", "docs/guide/en/basics.md", "docs/guide/ja/basics.md"];

// Well under what ships, because this guards against finding NOTHING, not against the count
// drifting. A spec that fails when someone deletes one example is a spec that gets deleted.
const FEWEST_SAMPLES_WE_SHIP = 12;

const IS_A_DATED_RELEASE_PAGE = /\/v\d[\d.]*\.md$/;

// The dated pages are in scope on purpose (see the header), so say at the point of failure what to
// do about one — the answer is a deliberate decision, not "drop warnings until it is quiet".
const adviceFor = (relative: string): string =>
  IS_A_DATED_RELEASE_PAGE.test(relative)
    ? "a dated page is what an upgrader copies on release day — fix the sample, or exclude this page here with the reason"
    : "a shipped sample is copied verbatim by readers and by agents";

describe("every keymap sample this repo ships", () => {
  it.each(PAGES_WITH_SAMPLES)("%s validates", (relative) => {
    const problems = keymapSampleProblems(read(relative), relative);
    expect(problems.join("\n"), adviceFor(relative)).toBe("");
  });

  // Without these two, an extractor that matched nothing would report a clean repo forever.
  it("actually found samples to check", () => {
    const found = PAGES_WITH_SAMPLES.reduce((total, relative) => total + keymapSamples(read(relative)).length, 0);
    expect(found).toBeGreaterThanOrEqual(FEWEST_SAMPLES_WE_SHIP);
  });

  it.each(ALWAYS_CARRY_A_SAMPLE)("%s still carries at least one", (relative) => {
    expect(keymapSamples(read(relative)).length).toBeGreaterThan(0);
  });

  // A `keymap` is two shapes — actions pointed at a key, and a `send` list carrying bytes — and the
  // aggregate guards above cannot see a filter that drops one of them: the count stays up and the
  // living pages stay covered while a whole kind of binding goes unchecked (codex, reviewing #2131).
  // `sampleShape` reads the parsed json, so this guard cannot be weakened into a text match that
  // anything satisfies.
  it("still reaches BOTH shapes a keymap can take", () => {
    const shapes = PAGES_WITH_SAMPLES.flatMap((relative) => keymapSamples(read(relative)).map(sampleShape));
    expect(
      shapes.some((shape) => shape.bindsAnAction),
      "no action binding is being checked any more",
    ).toBe(true);
    expect(
      shapes.some((shape) => shape.carriesSend),
      "no send binding is being checked any more",
    ).toBe(true);
  });
});
