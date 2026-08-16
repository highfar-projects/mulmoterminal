// @vitest-environment node
//
// When a resumed prompt-history scan may be believed (#1750).
//
// The read is a cache now, so its failure mode is the one caches have: answering the new question
// with the old rows, silently and plausibly. Three things can invalidate a memo and each is a
// different kind of stale — the question changed, the file changed, or the file lost bytes the last
// scan had already consumed.
import { describe, it, expect } from "vitest";
import { fileIdentity, memoKeyFor, resumePlan, type HistoryMemo, type HistoryStat } from "../../../server/session/prompt-history-memo";
import { claudePromptScan } from "../../../server/session/prompt-history";

const scan = () => claudePromptScan(["s1"], 100, undefined);
const memo = (over: Partial<HistoryMemo> = {}): HistoryMemo => ({ key: "s1|", identity: "42:1000", offset: 1000, scan: scan(), ...over });
const at = (size: number, ino = 42, birthtimeMs = 1000): HistoryStat => ({ ino, birthtimeMs, size });

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

describe("fileIdentity", () => {
  // CI proved this rather than theory: two temp files created in succession on Linux got the SAME
  // inode, and a memo taken against the first was accepted for the second.
  it("separates two files that recycled one inode number", () => {
    expect(fileIdentity({ ino: 42, birthtimeMs: 1000 })).not.toBe(fileIdentity({ ino: 42, birthtimeMs: 2000 }));
  });

  it("is stable across appends, which change neither field", () => {
    expect(fileIdentity({ ino: 42, birthtimeMs: 1000 })).toBe(fileIdentity({ ino: 42, birthtimeMs: 1000 }));
  });

  // The inode alone is not a weaker stamp, it is no stamp: the measurement below has it matching a
  // replacement 200/200 on Linux. So a file with no birth time gets none.
  it("refuses to stamp a file whose birth time the platform does not report", () => {
    expect(fileIdentity({ ino: 4242, birthtimeMs: 0 })).toBeNull();
    expect(fileIdentity({ ino: 0, birthtimeMs: 0 })).toBeNull();
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

  // The cache failure that matters most: the question changed while the file did not.
  it("starts over when the ids or the floor changed", () => {
    expect(resumePlan(memo(), "s1,s2|", at(4000))).toEqual({ from: 0, reuse: null });
    expect(resumePlan(memo(), "s1|1234", at(4000))).toEqual({ from: 0, reuse: null });
  });

  it("starts over when the file is a different one, even though it is bigger", () => {
    expect(resumePlan(memo(), "s1|", at(9000, 43))).toEqual({ from: 0, reuse: null });
    expect(resumePlan(memo(), "s1|", at(9000, 42, 2000))).toEqual({ from: 0, reuse: null }); // recycled inode
  });

  // Where the file cannot be identified, the resume is OFF — every refresh scans the whole file, as
  // it did before this PR. The alternative is resuming on the length alone, and the same recycled
  // inode that failed CI walks straight through that: a replacement bigger than the old offset reads
  // as an append, and the pane answers with the old file's prompts spliced onto the new one's tail.
  it("starts over where the platform reports no birth time, however the length compares", () => {
    const m = memo({ identity: null });
    expect(resumePlan(m, "s1|", at(4000, 42, 0))).toEqual({ from: 0, reuse: null });
    expect(resumePlan(m, "s1|", at(999, 42, 0))).toEqual({ from: 0, reuse: null });
    // And a memo that HAS a stamp is not resumed against a file that lost one.
    expect(resumePlan(memo(), "s1|", at(4000, 42, 0))).toEqual({ from: 0, reuse: null });
  });

  // The guard is the OFFSET, not a size sampled before the scan: claude can append mid-scan, so the
  // stream can run past that size, and a truncation to a length between the two would slip through.
  it("starts over when the file no longer holds the bytes the last scan consumed", () => {
    expect(resumePlan(memo({ offset: 1000 }), "s1|", at(999))).toEqual({ from: 0, reuse: null });
    expect(resumePlan(memo({ offset: 1500 }), "s1|", at(1200))).toEqual({ from: 0, reuse: null });
    expect(resumePlan(memo({ offset: 0 }), "s1|", at(0))).toEqual({ from: 0, reuse: memo({ offset: 0 }).scan });
  });
});

// The rounding that let CI fail. On Linux a delete-and-recreate hands back the SAME inode every
// time, so the birth time is the only thing separating the two files — and `Math.floor` threw away
// exactly the part that differs when the replacement lands inside the same millisecond. Measured on
// an ubuntu runner, 200 rounds with no delay: ino identical 200/200, `ino:floor(birthtimeMs)`
// collided 173/200, full precision collided 0/200.
describe("fileIdentity keeps sub-millisecond precision", () => {
  it("separates two files that share an inode within one millisecond", () => {
    const before = { ino: 2362397, birthtimeMs: 1786876144062.9866 };
    const after = { ino: 2362397, birthtimeMs: 1786876144062.9971 };
    expect(fileIdentity(before)).not.toBe(fileIdentity(after));
  });

  // The whole failure in one assertion: same identity => resumePlan hands back the old offset and
  // the old window, and the reader answers with the REPLACED file's prompts.
  it("does not resume across such a replacement", () => {
    const stat = { ino: 2362397, birthtimeMs: 1786876144062.9866, size: 100 };
    const memo = { key: "k", identity: fileIdentity(stat), offset: 100, scan: {} as never };
    const replaced = { ino: 2362397, birthtimeMs: 1786876144062.9971, size: 4000 };
    expect(resumePlan(memo, "k", replaced)).toEqual({ from: 0, reuse: null });
  });

  // Unchanged behaviour, kept so the fix cannot be "never resume anything".
  it("still resumes the same file", () => {
    const stat = { ino: 7, birthtimeMs: 1786876144062.9866, size: 100 };
    const memo = { key: "k", identity: fileIdentity(stat), offset: 100, scan: {} as never };
    expect(resumePlan(memo, "k", { ...stat, size: 4000 })).toEqual({ from: 100, reuse: memo.scan });
  });

  // The same 200/200 collision, reached the other way: a platform that reports no birth time leaves
  // the inode as the only stamp, so it gets no stamp at all and the resume stays off there.
  it("stamps nothing when the birth time is missing, rather than falling back to the inode", () => {
    expect(fileIdentity({ ino: 2362397, birthtimeMs: 0 })).toBeNull();
    const stat = { ino: 2362397, birthtimeMs: 0, size: 100 };
    const memo = { key: "k", identity: fileIdentity(stat), offset: 100, scan: {} as never };
    expect(resumePlan(memo, "k", { ino: 2362397, birthtimeMs: 0, size: 4000 })).toEqual({ from: 0, reuse: null });
  });
});
