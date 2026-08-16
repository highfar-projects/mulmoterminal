// @vitest-environment node
//
// When a resumed prompt-history scan may be believed (#1750).
//
// The read is a cache now, so its failure mode is the one caches have: answering the new question
// with the old rows, silently and plausibly. What can change under one session id is the set of
// claude ids being read (a hook learns a re-minted one) and the `/clear` floor — both change what
// the window should hold, and neither changes the FILE, so nothing else would notice.
import { describe, it, expect } from "vitest";
import { memoKeyFor, resumePlan, type HistoryMemo } from "../../../server/session/prompt-history-memo";
import { claudePromptScan } from "../../../server/session/prompt-history";

const scan = () => claudePromptScan(["s1"], 100, undefined);
const memo = (over: Partial<HistoryMemo> = {}): HistoryMemo => ({ key: "s1|", ino: 42, size: 1000, offset: 1000, scan: scan(), ...over });
const at = (size: number, ino = 42) => ({ ino, size });

describe("memoKeyFor", () => {
  it("separates a different set of ids", () => {
    expect(memoKeyFor(["s1"], undefined)).not.toBe(memoKeyFor(["s1", "s2"], undefined));
  });

  it("separates a floor from no floor, and two different floors", () => {
    expect(memoKeyFor(["s1"], undefined)).not.toBe(memoKeyFor(["s1"], 5));
    expect(memoKeyFor(["s1"], 5)).not.toBe(memoKeyFor(["s1"], 6));
  });

  it("is stable for the same question", () => {
    expect(memoKeyFor(["s1", "s2"], 7)).toBe(memoKeyFor(["s1", "s2"], 7));
  });
});

describe("resumePlan", () => {
  it("starts from the beginning when there is no memo", () => {
    expect(resumePlan(undefined, "s1|", at(1000))).toEqual({ from: 0, reuse: null });
  });

  it("resumes from where the last scan stopped", () => {
    const m = memo();
    expect(resumePlan(m, "s1|", at(4000))).toEqual({ from: 1000, reuse: m.scan });
  });

  it("treats an unchanged file as a resume of length zero, not a special case", () => {
    const m = memo();
    expect(resumePlan(m, "s1|", at(1000))).toEqual({ from: 1000, reuse: m.scan });
  });

  // The cache failure that matters: the question changed while the file did not.
  it("starts over when the ids or the floor changed", () => {
    expect(resumePlan(memo(), "s1,s2|", at(4000))).toEqual({ from: 0, reuse: null });
    expect(resumePlan(memo(), "s1|1234", at(4000))).toEqual({ from: 0, reuse: null });
  });

  // The case size CANNOT catch: the file was replaced and grew back past its old size, so the
  // recorded offset points into the middle of a file that never had it.
  it("starts over when the inode changed, even though the file is bigger", () => {
    expect(resumePlan(memo(), "s1|", at(9000, 43))).toEqual({ from: 0, reuse: null });
  });

  // A platform that reports no inode gives no evidence either way; treating that as "different
  // file" would disable the resume outright there.
  it("falls back to the size check where the platform reports no inode", () => {
    const m = memo();
    expect(resumePlan(m, "s1|", at(4000, 0))).toEqual({ from: 1000, reuse: m.scan });
    expect(resumePlan(memo({ ino: 0 }), "s1|", at(4000, 43))).toEqual({ from: 1000, reuse: memo({ ino: 0 }).scan });
  });

  // A file smaller than the recorded size was rotated or truncated, so the offset no longer points
  // where it did — the same reasoning nextReadRange applies to a codex rollout.
  it("starts over when the file shrank", () => {
    expect(resumePlan(memo(), "s1|", at(999))).toEqual({ from: 0, reuse: null });
    expect(resumePlan(memo(), "s1|", at(0))).toEqual({ from: 0, reuse: null });
  });
});
