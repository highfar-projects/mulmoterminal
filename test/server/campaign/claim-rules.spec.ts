// @vitest-environment node
//
// Exclusion is the answer to "two sessions keep modifying the same places", so the questions worth
// pinning are the ones where a wrong answer is invisible: a prefix that is not a directory
// boundary, an expiry read the wrong way round, and a holder that carried on after being taken
// over.
import { describe, it, expect } from "vitest";
import path from "node:path";
import {
  acquisitionOrder,
  blockingClaims,
  conflictingPaths,
  covers,
  fencingVerdict,
  isLive,
  nextToken,
  pathsConflict,
  renewed,
  type Claim,
  type ClaimToken,
} from "../../../server/campaign/claim-rules.js";

const p = (...segments: string[]): string => path.join(path.sep, ...segments);

const claim = (paths: string[], owner: string, generation: number, expiresAt: number): Claim => ({
  paths,
  token: { owner, generation },
  expiresAt,
});

describe("does one path cover another", () => {
  it("covers itself", () => {
    expect(covers(p("repo", "src"), p("repo", "src"))).toBe(true);
  });

  it("covers what is inside it", () => {
    expect(covers(p("repo", "src"), p("repo", "src", "a.ts"))).toBe(true);
    expect(covers(p("repo", "src"), p("repo", "src", "deep", "b.ts"))).toBe(true);
  });

  // The mistake a raw `startsWith` makes, and the one worth a test of its own: these are two
  // different files, and calling them one exclusion would let two tasks edit both believing they
  // were kept apart.
  it("does not cover a sibling that merely shares a prefix", () => {
    expect(covers(p("repo", "src"), p("repo", "srcfoo"))).toBe(false);
    expect(covers(p("a", "foo"), p("a", "foobar"))).toBe(false);
  });

  it("does not cover its own parent", () => {
    expect(covers(p("repo", "src", "a.ts"), p("repo", "src"))).toBe(false);
  });

  it("tolerates a trailing separator on the covering path", () => {
    expect(covers(p("repo", "src") + path.sep, p("repo", "src", "a.ts"))).toBe(true);
  });

  // A path is a value from outside, so this has to survive a silly one. Two hand-rolled trims did
  // not — a regex backtracked super-linearly, and recursing per separator threw `RangeError` at
  // twenty thousand — which is part of why the comparison is now the shared `isWithin`.
  it("survives a path with an absurd number of trailing separators", () => {
    const silly = p("repo", "src") + path.sep.repeat(50_000);
    expect(covers(silly, p("repo", "src", "a.ts"))).toBe(true);
    expect(covers(silly, p("repo", "srcfoo"))).toBe(false);
  });

  // The same directory spelled two ways must get ONE answer. Before the trim, `/a/` did not cover
  // `/a` while `/a` covered `/a/` — decided by which way round it was asked.
  it("gives one answer for the two spellings of one directory", () => {
    const bare = p("repo", "src");
    const slashed = bare + path.sep;
    expect(covers(slashed, bare)).toBe(true);
    expect(covers(bare, slashed)).toBe(true);
  });

  it("treats the root as covering everything under it", () => {
    expect(covers(path.sep, p("anything"))).toBe(true);
  });
});

// The gap `canonicalPath` leaves, pinned so it is a known limitation rather than a surprise: a
// component that does not exist yet keeps the case it was typed with, and a claim is declared
// before the work. On Windows `isWithin` folds and these are one claim; on a case-insensitive macOS
// volume they are two keys for one file, and closing that is the registry's job.
describe("case, and what this layer cannot decide", () => {
  it("folds case on Windows, where the OS does", () => {
    expect(covers("C:\\repo\\Src", "C:\\repo\\src\\a.ts", "win32")).toBe(true);
  });

  it("does not fold on posix, where two spellings are genuinely two paths", () => {
    expect(covers("/repo/Src", "/repo/src/a.ts", "linux")).toBe(false);
  });
});

describe("conflict", () => {
  it("is symmetric — either one covering the other is a conflict", () => {
    const parent = p("repo", "src");
    const child = p("repo", "src", "a.ts");
    expect(pathsConflict(parent, child)).toBe(true);
    expect(pathsConflict(child, parent)).toBe(true);
  });

  it("finds nothing between unrelated paths", () => {
    expect(pathsConflict(p("repo", "src"), p("repo", "test"))).toBe(false);
  });

  it("reports every wanted path that collides, and no others", () => {
    const held = [p("repo", "src"), p("repo", "docs")];
    const wanted = [p("repo", "src", "a.ts"), p("repo", "test", "b.ts"), p("repo", "docs")];
    expect(conflictingPaths(held, wanted)).toEqual([p("repo", "src", "a.ts"), p("repo", "docs")]);
  });

  it("finds nothing against an empty holding", () => {
    expect(conflictingPaths([], [p("repo", "src")])).toEqual([]);
  });

  it("wants nothing, conflicts with nothing", () => {
    expect(conflictingPaths([p("repo", "src")], [])).toEqual([]);
  });
});

describe("liveness", () => {
  const held = claim([p("repo", "src")], "t1", 1, 1000);

  it("is live before the deadline", () => {
    expect(isLive(held, 999)).toBe(true);
  });

  // Exclusive, and stated as a test because an off-by-one here means two holders for one instant.
  it("is over AT the deadline, not after it", () => {
    expect(isLive(held, 1000)).toBe(false);
    expect(isLive(held, 1001)).toBe(false);
  });
});

describe("what blocks an acquisition", () => {
  const now = 500;
  const live = claim([p("repo", "src")], "t1", 1, 1000);
  const stale = claim([p("repo", "docs")], "t2", 1, 100);

  it("blocks on a live claim that overlaps", () => {
    expect(blockingClaims([live], [p("repo", "src", "a.ts")], now)).toEqual([live]);
  });

  it("does not block on a live claim that does not overlap", () => {
    expect(blockingClaims([live], [p("repo", "test")], now)).toEqual([]);
  });

  // Expiry is what stops a crashed task holding paths for ever. It does not make the record
  // vanish: taking it over still has to move the generation, which is the registry's job.
  it("does not block on an expired claim, however much it overlaps", () => {
    expect(blockingClaims([stale], [p("repo", "docs")], now)).toEqual([]);
  });

  it("reports every blocker, not just the first", () => {
    const other = claim([p("repo", "test")], "t3", 1, 1000);
    expect(blockingClaims([live, other], [p("repo", "src"), p("repo", "test")], now)).toEqual([live, other]);
  });
});

describe("acquisition order", () => {
  // A deadlock argument, not tidiness: two tasks wanting overlapping sets meet on the same path
  // first, so one loses there rather than each holding half of what the other needs.
  it("puts two overlapping requests in the same order", () => {
    const first = acquisitionOrder([p("b"), p("a"), p("c")]);
    const second = acquisitionOrder([p("c"), p("a")]);
    expect(first.indexOf(p("a"))).toBeLessThan(first.indexOf(p("c")));
    expect(second.indexOf(p("a"))).toBeLessThan(second.indexOf(p("c")));
  });

  it("drops a path asked for twice, so it cannot be acquired twice", () => {
    expect(acquisitionOrder([p("a"), p("a"), p("b")])).toEqual([p("a"), p("b")]);
  });

  it("orders nothing when nothing is wanted", () => {
    expect(acquisitionOrder([])).toEqual([]);
  });

  // The order must be the same in EVERY process for the deadlock argument to hold, so it cannot be
  // the locale's. Case is where the two disagree: code units put `A` before `a`, and a locale
  // collation typically does the opposite.
  //
  // Only our own order is asserted. What `localeCompare` returns depends on the machine, so
  // pinning it here would make this test's answer depend on where it runs — the very property
  // being ruled out.
  it("orders by code unit, so two runners cannot disagree", () => {
    expect(acquisitionOrder([p("a"), p("A")])).toEqual([p("A"), p("a")]);
    expect(acquisitionOrder([p("Z"), p("z")])).toEqual([p("Z"), p("z")]);
  });
});

describe("fencing", () => {
  const held = claim([p("repo", "src")], "t1", 3, 1000);
  const holder: ClaimToken = { owner: "t1", generation: 3 };

  it("lets the holder act while the claim is live", () => {
    expect(fencingVerdict(held, holder, 999)).toBe("ok");
  });

  it("refuses a task that never held it", () => {
    expect(fencingVerdict(held, { owner: "t2", generation: 3 }, 999)).toBe("not-the-owner");
  });

  // The case the generation exists for: the previous holder is still running and still believes
  // it owns the paths. Its next write has to be refused, and told apart from a stranger's.
  it("refuses a holder whose claim was taken over", () => {
    const takenOver = claim([p("repo", "src")], "t1", 4, 1000);
    expect(fencingVerdict(takenOver, holder, 999)).toBe("superseded");
  });

  // One situation, one answer. Reported as `not-the-owner` before, purely because somebody ELSE
  // took the claim over — which reads to a runner as a bug in its own code rather than as
  // "somebody has this now, stop".
  it("says the same thing when the claim changed hands to another task", () => {
    const takenOverByOther = claim([p("repo", "src")], "t2", 4, 1000);
    expect(fencingVerdict(takenOverByOther, holder, 999)).toBe("superseded");
  });

  it("still refuses a stranger presenting the CURRENT generation", () => {
    expect(fencingVerdict(held, { owner: "t2", generation: 3 }, 999)).toBe("not-the-owner");
  });

  // No registry ever issued it, so it is an invented token rather than a late one.
  it("refuses a generation above the current one as a caller bug, not as a stale holder", () => {
    expect(fencingVerdict(held, { owner: "t1", generation: 9 }, 999)).toBe("not-the-owner");
  });

  it("refuses the holder once the claim has lapsed, without calling it a stranger", () => {
    expect(fencingVerdict(held, holder, 1000)).toBe("expired");
  });

  // Order matters: a stale generation is reported as superseded even past the deadline, because
  // "somebody else has this" is what the caller must act on, not "you are late".
  it("reports a superseded holder as superseded, not as expired", () => {
    const takenOver = claim([p("repo", "src")], "t1", 4, 1000);
    expect(fencingVerdict(takenOver, holder, 5000)).toBe("superseded");
  });
});

describe("changing hands and staying put", () => {
  const before: ClaimToken = { owner: "t1", generation: 7 };

  it("raises the generation on a takeover, so the old holder is fenced out", () => {
    expect(nextToken(before, "t2")).toEqual({ owner: "t2", generation: 8 });
  });

  // Never a reset: the previous holder may still be running, and the number is the only thing
  // that will tell its next write from the new holder's.
  it("raises it even when the same task takes the claim back", () => {
    expect(nextToken(before, "t1")).toEqual({ owner: "t1", generation: 8 });
  });

  it("moves the deadline on a renewal and leaves the token alone", () => {
    const held = claim([p("repo", "src")], "t1", 7, 1000);
    const still = renewed(held, 900, 500);
    expect(still).toMatchObject({ expiresAt: 1400, token: held.token, paths: held.paths });
  });

  it("renews from now, not from the old deadline — a late renewal does not bank the gap", () => {
    const held = claim([p("repo", "src")], "t1", 7, 1000);
    expect(renewed(held, 999, 500)?.expiresAt).toBe(1499);
  });

  // Renewing in place after the term would leave the generation where it was, so a holder that
  // fencing had already turned away as `expired` would come back as `ok` — while somebody else may
  // hold the paths, distinguishable only by a higher generation.
  it("refuses to renew a claim whose term has run out", () => {
    const lapsed = claim([p("repo", "src")], "t1", 7, 1000);
    expect(renewed(lapsed, 1000, 500)).toBeNull();
    expect(renewed(lapsed, 5000, 500)).toBeNull();
  });

  it("does not let a renewal undo a fencing verdict", () => {
    const lapsed = claim([p("repo", "src")], "t1", 7, 1000);
    const holder: ClaimToken = { owner: "t1", generation: 7 };
    expect(fencingVerdict(lapsed, holder, 1500)).toBe("expired");
    expect(renewed(lapsed, 1500, 500)).toBeNull();
  });
});
