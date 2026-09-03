// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import { gitStatus, dirtyCount, resetGitStatusCache, GIT_STATUS_TTL_MS } from "./git-status";
import { parsePorcelainV2 } from "./git-parse";
import { splitLines } from "../infra/split-lines";

const NOW = 1_700_000_000_000;

const parse = (stdout: string) => parsePorcelainV2(stdout, splitLines);

const TRACKING = [
  "# branch.oid d9d95e03415bcee8072791f259679cc72de368f9",
  "# branch.head main",
  "# branch.upstream origin/main",
  "# branch.ab +2 -3",
  "1 .M N... 100644 100644 100644 1111111 1111111 a.ts",
  "? b.ts",
  "",
].join("\n");

describe("parsePorcelainV2", () => {
  it("reads branch, ahead/behind and dirty from one status", () => {
    expect(parse(TRACKING)).toEqual({ branch: "main", detached: false, dirty: 2, ahead: 2, behind: 3, upstream: true });
  });

  // The whole point of replacing `rev-list --left-right --count`, whose output was
  // "<behind><tab><ahead>": `branch.ab` writes the same pair as "+ahead -behind", and reading
  // the minus as written would report behind as a negative count.
  it("reads both sides of branch.ab as magnitudes", () => {
    expect(parse("# branch.head main\n# branch.upstream origin/main\n# branch.ab +0 -7\n")).toMatchObject({ ahead: 0, behind: 7 });
  });

  it("reports a detached HEAD with no branch", () => {
    expect(parse("# branch.oid d9d95e0\n# branch.head (detached)\n")).toEqual({
      branch: null,
      detached: true,
      dirty: 0,
      ahead: 0,
      behind: 0,
      upstream: false,
    });
  });

  // What `rev-parse --abbrev-ref HEAD` could not answer and `symbolic-ref` was spawned for: a
  // fresh `git init` names its branch before there is any commit on it.
  it("names an unborn branch", () => {
    expect(parse("# branch.oid (initial)\n# branch.head main\n? a.ts\n")).toMatchObject({ branch: "main", detached: false, dirty: 1 });
  });

  it("leaves ahead/behind at zero when HEAD tracks nothing", () => {
    expect(parse("# branch.oid abc1234\n# branch.head feature\n1 .M N... 100644 100644 100644 1111111 1111111 x.ts\n")).toEqual({
      branch: "feature",
      detached: false,
      dirty: 1,
      ahead: 0,
      behind: 0,
      upstream: false,
    });
  });

  it("counts a rename as one entry, as porcelain v1 did", () => {
    expect(parse("# branch.head main\n2 R. N... 100644 100644 100644 1111111 2222222 R100 new.ts\told.ts\n")).toMatchObject({ dirty: 1 });
  });

  // An entry line always begins with its own type character and a space, so a path that starts
  // with "#" cannot be read as one of the `--branch` headers.
  it("counts a path beginning with # as an entry, not a header", () => {
    expect(parse("# branch.head main\n? #notes.md\n")).toMatchObject({ dirty: 1, branch: "main" });
  });

  // Output reaches us as whatever the platform wrote, and a stray CR on branch.head would put an
  // invisible character in the chip and in every branch comparison downstream.
  it("survives CRLF line endings", () => {
    expect(parse(TRACKING.replace(/\n/g, "\r\n"))).toEqual({ branch: "main", detached: false, dirty: 2, ahead: 2, behind: 3, upstream: true });
  });
});

// A stand-in for the git runner that stays pending until the test releases it, so a second call
// can be made while the first is still running — the situation the roster's poll creates.
function deferredGit(stdout: string) {
  const calls: string[][] = [];
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const run = async (args: string[]): Promise<{ ok: boolean; stdout: string }> => {
    calls.push(args);
    await gate;
    return { ok: true, stdout };
  };
  return { run, calls, release };
}

describe("gitStatus", () => {
  beforeEach(() => resetGitStatusCache());

  // The regression guard for the shape itself: splitting this back into a status plus a
  // `rev-list` (or a `symbolic-ref`, or a `rev-parse --show-toplevel`) is what let the
  // unguarded calls pile up, since the guard can only cover the call it wraps.
  it("asks one git call for branch, ahead/behind and dirty together", async () => {
    const { run, calls, release } = deferredGit(TRACKING);
    const status = gitStatus("/repo", { run, now: () => NOW });
    release();
    expect(await status).toEqual({ repo: true, branch: "main", detached: false, dirty: 2, ahead: 2, behind: 3, upstream: true });
    expect(calls).toEqual([["status", "--porcelain=v2", "--branch"]]);
  });

  it("reports a non-repo dir rather than throwing", async () => {
    const run = async () => ({ ok: false, stdout: "" });
    expect(await gitStatus("/plain", { run, now: () => NOW })).toEqual({
      repo: false,
      branch: null,
      detached: false,
      dirty: 0,
      ahead: 0,
      behind: 0,
      upstream: false,
    });
  });

  // The guard that bounds the process count: however fast the poll ticks, one directory never
  // has two `git status` running at once.
  it("shares one call between callers that arrive while it is still running", async () => {
    const { run, calls, release } = deferredGit(TRACKING);
    const now = () => NOW;

    const first = gitStatus("/repo", { run, now });
    const second = gitStatus("/repo", { run, now });
    const third = gitStatus("/repo", { run, now });
    expect(calls).toHaveLength(1);

    release();
    const all = await Promise.all([first, second, third]);
    expect(all.map((s) => s.dirty)).toEqual([2, 2, 2]);
    expect(calls).toHaveLength(1);
  });

  // dirtyCount used to run its own `status --porcelain`, so a cell showing the branch chip and a
  // worktree badge spawned two statuses over one directory. They are the same call now.
  it("serves dirtyCount from the same call as the full status", async () => {
    const { run, calls, release } = deferredGit(TRACKING);
    const now = () => NOW;

    const status = gitStatus("/repo", { run, now });
    const dirty = dirtyCount("/repo", { run, now });
    release();

    expect((await status).dirty).toBe(2);
    expect(await dirty).toBe(2);
    expect(calls).toHaveLength(1);
  });

  it("keeps separate directories independent", async () => {
    const { run, calls, release } = deferredGit(TRACKING);
    const now = () => NOW;

    const a = gitStatus("/repo-a", { run, now });
    const b = gitStatus("/repo-b", { run, now });
    release();
    await Promise.all([a, b]);
    expect(calls).toHaveLength(2);
  });

  it("reuses a fresh answer and recomputes once it goes stale", async () => {
    let count = 0;
    const run = async () => ({ ok: true, stdout: `# branch.head main\n${++count === 1 ? "? a.ts" : "? a.ts\n? b.ts"}\n` });
    let clock = NOW;
    const now = () => clock;

    expect(await dirtyCount("/repo", { run, now })).toBe(1);
    clock = NOW + GIT_STATUS_TTL_MS - 1;
    expect(await dirtyCount("/repo", { run, now })).toBe(1);
    expect(count).toBe(1);

    clock = NOW + GIT_STATUS_TTL_MS;
    expect(await dirtyCount("/repo", { run, now })).toBe(2);
    expect(count).toBe(2);
  });

  // A repo whose status times out is the one that must NOT be retried every tick.
  it("caches a failure too", async () => {
    let count = 0;
    const run = async () => {
      count++;
      return { ok: false, stdout: "" };
    };
    const now = () => NOW;

    expect((await gitStatus("/repo", { run, now })).repo).toBe(false);
    expect((await gitStatus("/repo", { run, now })).repo).toBe(false);
    expect(count).toBe(1);
  });

  it("releases the in-flight slot so a later call can run", async () => {
    const { run, calls, release } = deferredGit(TRACKING);
    let clock = NOW;
    const now = () => clock;

    const first = gitStatus("/repo", { run, now });
    release();
    await first;

    clock = NOW + GIT_STATUS_TTL_MS;
    await gitStatus("/repo", { run, now });
    expect(calls).toHaveLength(2);
  });
});
