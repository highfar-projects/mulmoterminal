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

  // A translation that left the English in place is not a translation, and it is the failure mode
  // a bundle copied from `en` produces. Checked on Japanese, where every one of these differs.
  it("actually translates them into Japanese", () => {
    STATES.forEach((state) => {
      [ROSTER_STATUS_KEY[state], CELL_STATUS_KEY[state]].forEach((key) => {
        expect(lookUp(ja, key)).not.toBe(lookUp(en, key));
      });
    });
  });
});
