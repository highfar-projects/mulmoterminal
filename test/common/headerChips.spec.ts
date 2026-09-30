// #2622. The header chips change one entry at a time; an unconfigured list starts from the default
// set, and a remove or move names the chip it means so a changed list is refused, not misread.
import { describe, it, expect } from "vitest";
import {
  CELL_CHIP_IDS,
  MAX_HEADER_CHIPS,
  chipsMoved,
  chipsWithAdded,
  chipsWithout,
  effectiveChips,
  isChipEntry,
  isChipProblem,
  sameChip,
  type ChipDraft,
} from "../../common/headerChips";

const draft = (fields: Partial<ChipDraft>): ChipDraft => ({ builtin: "", label: "", text: "", when: "", ...fields });
const custom = { label: "env", text: "${branch}" };

describe("effectiveChips", () => {
  it("is the default set when unconfigured, and the list itself otherwise", () => {
    expect(effectiveChips(null)).toEqual([...CELL_CHIP_IDS]);
    expect(effectiveChips([])).toEqual([]);
    expect(effectiveChips(["ctx"])).toEqual(["ctx"]);
  });
});

describe("chipsWithAdded", () => {
  it("appends to the list, starting from the defaults when nothing was configured", () => {
    expect(chipsWithAdded(null, draft({ builtin: " ctx " }))).toEqual({ problem: "duplicate" });
    expect(chipsWithAdded(["git"], draft({ builtin: "ctx" }))).toEqual({ chips: ["git", "ctx"] });
    expect(chipsWithAdded([], draft({ label: " env ", text: " ${branch} ", when: " isGitRepo " }))).toEqual({
      chips: [{ label: "env", text: "${branch}", when: "isGitRepo" }],
    });
    expect(chipsWithAdded(null, draft(custom))).toEqual({ chips: [...CELL_CHIP_IDS, custom] });
  });

  it("leaves `when` out when it is blank", () => {
    expect(chipsWithAdded([], draft({ ...custom, when: "   " }))).toEqual({ chips: [custom] });
  });

  it("refuses what the cell cannot show, or what is incomplete", () => {
    ["dir", "status", "tools", "nope"].forEach((builtin) => expect(chipsWithAdded([], draft({ builtin }))).toEqual({ problem: "builtin" }));
    expect(chipsWithAdded([], draft({ text: "x" }))).toEqual({ problem: "label" });
    expect(chipsWithAdded([], draft({ label: "x", text: "  " }))).toEqual({ problem: "text" });
  });

  it("refuses past the cap, and allows the last slot", () => {
    const almost = Array.from({ length: MAX_HEADER_CHIPS - 1 }, (_, i) => ({ label: `c${i}`, text: "t" }));
    expect(chipsWithAdded(almost, draft(custom))).toHaveProperty("chips");
    expect(chipsWithAdded([...almost, custom], draft(custom))).toEqual({ problem: "full" });
  });

  it("allows the same custom chip twice, as the runtime does", () => {
    expect(chipsWithAdded([custom], draft(custom))).toEqual({ chips: [custom, custom] });
  });
});

describe("chipsWithout", () => {
  it("removes the chip named at that index", () => {
    expect(chipsWithout(["git", custom], 1, { ...custom })).toEqual({ chips: ["git"] });
    expect(chipsWithout(null, 0, "git")).toEqual({ chips: CELL_CHIP_IDS.slice(1) });
  });

  it("refuses when the chip there is not the one the caller saw", () => {
    expect(chipsWithout(["git", "ctx"], 0, "ctx")).toEqual({ problem: "stale" });
    expect(chipsWithout(["git"], 1, "git")).toEqual({ problem: "stale" });
    expect(chipsWithout(["git"], -1, "git")).toEqual({ problem: "stale" });
    expect(chipsWithout(["git"], 0.5, "git")).toEqual({ problem: "stale" });
    expect(chipsWithout([custom], 0, { ...custom, when: "isGitRepo" })).toEqual({ problem: "stale" });
  });
});

describe("chipsMoved", () => {
  it("swaps with the neighbour in either direction", () => {
    expect(chipsMoved(["a", "b", "c"], 1, -1, "b")).toEqual({ chips: ["b", "a", "c"] });
    expect(chipsMoved(["a", "b", "c"], 1, 1, "b")).toEqual({ chips: ["a", "c", "b"] });
    expect(chipsMoved(null, 0, 1, "git")).toEqual({ chips: ["work", "git", ...CELL_CHIP_IDS.slice(2)] });
  });

  it("refuses past either end, or on a chip that moved", () => {
    expect(chipsMoved(["a", "b"], 0, -1, "a")).toEqual({ problem: "stale" });
    expect(chipsMoved(["a", "b"], 1, 1, "b")).toEqual({ problem: "stale" });
    expect(chipsMoved(["a", "b"], 0, 1, "b")).toEqual({ problem: "stale" });
  });
});

describe("guards", () => {
  it("sameChip compares a custom chip by all three fields, treating no `when` as empty", () => {
    expect(sameChip("git", "git")).toBe(true);
    expect(sameChip("git", custom)).toBe(false);
    expect(sameChip(custom, { ...custom, when: "" })).toBe(true);
    expect(sameChip(custom, { ...custom, text: "x" })).toBe(false);
  });

  it("isChipEntry takes a string or a label/text pair with an optional string `when`", () => {
    [["git"], [custom], [{ ...custom, when: "x" }]].forEach(([value]) => expect(isChipEntry(value)).toBe(true));
    [null, 1, {}, { label: "x" }, { label: 1, text: "t" }, { ...custom, when: 3 }].forEach((value) => expect(isChipEntry(value)).toBe(false));
  });

  it("isChipProblem knows only its own words", () => {
    expect(isChipProblem("stale")).toBe(true);
    expect(isChipProblem("label ")).toBe(false);
    expect(isChipProblem(undefined)).toBe(false);
  });
});
