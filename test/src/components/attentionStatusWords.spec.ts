// Every i18n key the status tables name resolves to a real message (#2182).
//
// This exists because a key is just a `string`: `status.cell.blockd` typechecks, passes every
// other spec, and renders the key path on a user's screen. Nothing caught that until this file —
// a mutation putting exactly that typo into TerminalCell survived the whole suite.
//
// It resolves against the REAL English bundle rather than a stub, for the same reason: a stub
// that echoes the key back makes every wrong key correct.
import { describe, it, expect } from "vitest";
import { CELL_STATUS_KEY, ROSTER_STATUS_KEY, type AttentionStatus } from "../../../src/components/attentionStatus";
import { en } from "../../../src/i18n/en";
import { ja } from "../../../src/i18n/ja";
import { zhCN } from "../../../src/i18n/zh-CN";
import { zhTW } from "../../../src/i18n/zh-TW";
import { ko } from "../../../src/i18n/ko";

const BUNDLES = { en, ja, "zh-CN": zhCN, "zh-TW": zhTW, ko };

const lookUp = (bundle: unknown, key: string): unknown =>
  key.split(".").reduce<unknown>((node, part) => (node && typeof node === "object" ? (node as Record<string, unknown>)[part] : undefined), bundle);

// Named rather than derived from the type, so that adding a state to `AttentionStatus` fails the
// first test below until somebody lists it here too — the same reason the tables spell their keys
// out instead of building them.
const STATES: AttentionStatus[] = ["working", "blocked", "done", "idle"];

// A PR's short badge is GitHub's own word and stays English in every locale — see the note in
// i18n/en.ts. Listed rather than matched on `.label`, so that a future English-by-design key has
// to be added here on purpose.
const KEPT_IN_ENGLISH = [
  "status.pr.draft.label",
  "status.pr.ci-failing.label",
  "status.pr.changes-requested.label",
  "status.pr.ci-running.label",
  "status.pr.ready.label",
  "status.pr.merged.label",
  "status.pr.closed.label",
];

/** Every leaf under `status` in the English bundle that a translation is expected to change. */
const translatableStatusKeys = (): string[] => {
  const walk = (node: unknown, path: string): string[] => {
    if (typeof node === "string") return KEPT_IN_ENGLISH.includes(path) ? [] : [path];
    if (node === null || typeof node !== "object") return [];
    return Object.entries(node).flatMap(([part, child]) => walk(child, path === "" ? part : `${path}.${part}`));
  };
  return walk(en.status, "status");
};

describe("the status words the grid and the roster keep on screen", () => {
  it("covers every attention status, so a new one cannot slip past this file", () => {
    expect(Object.keys(ROSTER_STATUS_KEY).sort()).toEqual([...STATES].sort());
    expect(Object.keys(CELL_STATUS_KEY).sort()).toEqual([...STATES].sort());
  });

  it.each(Object.keys(BUNDLES))("resolves every key in %s", (locale) => {
    const bundle = BUNDLES[locale as keyof typeof BUNDLES];
    const unresolved = STATES.flatMap((state) => [ROSTER_STATUS_KEY[state], CELL_STATUS_KEY[state]]).filter((key) => typeof lookUp(bundle, key) !== "string");
    expect(unresolved).toEqual([]);
  });

  // The two tables are different registers of the same state and must not be merged: the roster
  // badge has room for one word, the cell header for a short phrase.
  it("keeps the badge word and the cell phrase apart", () => {
    STATES.forEach((state) => expect(ROSTER_STATUS_KEY[state]).not.toBe(CELL_STATUS_KEY[state]));
  });

  // A bundle that left the English in place is not translated, and the `Messages` type cannot see
  // it: a copied English string satisfies the shape perfectly. Codex reproduced the gap on #2201 —
  // zh-CN's `status.attention.working` changed back to "running" kept every spec green.
  //
  // So this walks the WHOLE `status` section of the English bundle rather than the two tables
  // above, and asserts every other locale says something else. The exceptions are listed, not
  // pattern-matched, so a new key that should stay in English is a deliberate line here rather
  // than a silent omission.
  it.each(["ja", "zh-CN", "zh-TW", "ko"])("says something other than the English in %s", (locale) => {
    const bundle = BUNDLES[locale as keyof typeof BUNDLES];
    const untranslated = translatableStatusKeys().filter((key) => lookUp(bundle, key) === lookUp(en, key));
    expect(untranslated).toEqual([]);
  });

  // The sweep above is only worth anything if it found the keys. A typo in the walker would make
  // every locale vacuously translated.
  it("finds the whole status section to check, not a subset of it", () => {
    const keys = translatableStatusKeys();
    expect(keys).toContain("status.attention.idle");
    expect(keys).toContain("status.cell.blocked");
    expect(keys).toContain("status.work.planning");
    expect(keys).toContain("status.pr.ready.title");
    expect(keys).toContain("status.pr.ready.state");
    expect(keys).toContain("status.cellMissedNotify");
    // …and it must NOT sweep the badges, which are English on purpose.
    expect(keys).not.toContain("status.pr.ready.label");
    expect(keys.length).toBeGreaterThan(KEPT_IN_ENGLISH.length);
  });
});
