// @vitest-environment node
// Setting a chaff finding aside with a reason (the docs base's dismissals.mjs): a dismissal must match a finding
// chaff reports now, must say why and on which ground, and only the ones chaff misread become draft reports.
import { describe, expect, it } from "vitest";
import { dismissalProblems, unreportedDismissals, withoutDismissed, wrongCases } from "../../../blueprints/docs/checks/dismissals.mjs";

const finding = (rule: string, line: number) => ({ rule, level: "warning", file: "a.md", line });
const found = [finding("max-sentence-length", 12), finding("internal-jargon", 3)];
const dismissal = (overrides: Record<string, unknown> = {}) => ({ rule: "max-sentence-length", line: 12, because: "meaning", why: "引用", ...overrides });

describe("dismissalProblems", () => {
  it("accepts none, or dismissals that match what chaff reports", () => {
    expect(dismissalProblems("a.md", undefined, found)).toEqual([]);
    expect(dismissalProblems("a.md", [dismissal(), dismissal({ rule: "internal-jargon", line: 3, because: "wrong" })], found)).toEqual([]);
  });

  const cases: readonly (readonly [string, unknown, string])[] = [
    ["not an array", {}, '"dismissed" must be an array'],
    ["no rule", [dismissal({ rule: undefined })], 'needs "rule" and "line"'],
    ["a line that is not a number", [dismissal({ line: "12" })], 'needs "rule" and "line"'],
    ["no ground", [dismissal({ because: undefined })], '"because" must be "wrong"'],
    ["another ground", [dismissal({ because: "style" })], '"because" must be "wrong"'],
    ["no why", [dismissal({ why: " " })], 'needs a "why"'],
    ["a finding chaff does not report", [dismissal({ line: 13 })], "chaff reports no max-sentence-length on line 13 now"],
    ["the right line under another rule", [dismissal({ rule: "internal-jargon" })], "chaff reports no internal-jargon on line 12"],
  ];
  it.each(cases)("refuses %s", (_name, dismissed, message) => expect(dismissalProblems("a.md", dismissed, found).join("\n")).toContain(message));

  it("labels each problem with where it is", () => {
    expect(dismissalProblems("intro", [dismissal(), dismissal({ why: "" })], found)).toEqual([
      'intro: dismissed[1] (max-sentence-length, line 12) needs a "why"',
    ]);
  });
});

describe("withoutDismissed", () => {
  it("sets aside one finding per dismissal, and refuses a dismissal with no finding left for it", () => {
    const twice = [finding("max-sentence-length", 12), finding("max-sentence-length", 12)];
    expect(withoutDismissed(twice, [dismissal()])).toEqual([finding("max-sentence-length", 12)]);
    expect(withoutDismissed(twice, [dismissal(), dismissal()])).toEqual([]);
    expect(dismissalProblems("a.md", [dismissal(), dismissal()], twice)).toEqual([]);
    expect(dismissalProblems("a.md", [dismissal(), dismissal()], found).join("\n")).toContain("chaff reports only 1 max-sentence-length on line 12");
  });

  it("sets aside exactly the dismissed findings", () => {
    expect(withoutDismissed(found, [dismissal()])).toEqual([finding("internal-jargon", 3)]);
    expect(withoutDismissed(found, undefined)).toEqual(found);
    expect(withoutDismissed(found, [dismissal({ line: 3 })])).toEqual(found);
  });
});

describe("unreportedDismissals", () => {
  const owners = [{ key: "a.md", dismissed: [dismissal({ why: "条文の引用" })] }];
  it("wants a line per dismissal giving its rule, its line number and its why word for word", () => {
    expect(unreportedDismissals(owners, "- a.md 12 行目 max-sentence-length: 条文の引用")).toEqual([]);
    expect(unreportedDismissals(owners, "- 12 行目 max-sentence-length: 引用なので")).toEqual(["a.md max-sentence-length (line 12)"]);
    expect(unreportedDismissals(owners, "- 12 行目: 条文の引用")).toEqual(["a.md max-sentence-length (line 12)"]);
    expect(unreportedDismissals(owners, "- max-sentence-length: 条文の引用 (line 120)")).toEqual(["a.md max-sentence-length (line 12)"]);
    expect(unreportedDismissals(owners, "- max-sentence-length\n- 12: 条文の引用")).toEqual(["a.md max-sentence-length (line 12)"]);
    expect(unreportedDismissals([{ key: "b.md" }], "")).toEqual([]);
  });

  it("does not let one report line stand for two dismissals", () => {
    const two = [
      { key: "a.md", dismissed: [dismissal({ why: "条文の引用" })] },
      { key: "b.md", dismissed: [dismissal({ why: "条文の引用" })] },
    ];
    expect(unreportedDismissals(two, "- 12 max-sentence-length 条文の引用")).toEqual(["b.md max-sentence-length (line 12)"]);
    expect(unreportedDismissals(two, "- a.md 12 max-sentence-length 条文の引用\n- b.md 12 max-sentence-length 条文の引用")).toEqual([]);
  });
});

describe("wrongCases", () => {
  it("drafts only what chaff misread, with ids unique across files", () => {
    const owners = [
      { key: "1", file: "a.md", dismissed: [dismissal({ because: "wrong" }), dismissal({ rule: "internal-jargon", line: 3 })] },
      { key: "2", file: "b.md", dismissed: [dismissal({ because: "wrong", line: 4 })] },
      { key: "3", file: "c.md" },
    ];
    expect(wrongCases(owners)).toEqual([
      { id: "wrong-1-1", kind: "wrong", file: "a.md", rule: "max-sentence-length", line: 12 },
      { id: "wrong-2-1", kind: "wrong", file: "b.md", rule: "max-sentence-length", line: 4 },
    ]);
  });
});
