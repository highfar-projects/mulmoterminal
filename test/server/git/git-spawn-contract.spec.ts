// @vitest-environment node
//
// `git()` promises, in its own comment, never to reject — every caller is written against that and
// treats `ok: false` as the fallback path. One argument breaks it: `spawn` THROWS SYNCHRONOUSLY for
// a string execve will not take, and a throw inside the Promise executor rejects.
//
// A NUL byte is the reachable one. It became reachable when the content search started putting a
// user's query into argv (#2140) — `?q=%00` — where the rejection surfaced as a 500 rather than the
// empty result every other failure gives. The fix belongs in the helper rather than at that one
// call site, because the next caller to pass user text would rediscover it.
import { describe, it, expect } from "vitest";
import { git } from "../../../server/git/worktrees.js";

const NUL = String.fromCharCode(0);

describe("git() and an argument the OS will not take", () => {
  it("resolves rather than rejecting, which is what its callers are written against", async () => {
    // `.resolves` and not a try/catch: a try/catch around an assertion passes when nothing throws
    // AND when the assertion is never reached, and those look identical in a green run.
    await expect(git(["grep", "-e", `a${NUL}b`, "--"], process.cwd(), 5000)).resolves.toBeDefined();
  });

  it("reports it as the process never having run", async () => {
    const result = await git(["grep", "-e", `a${NUL}b`, "--"], process.cwd(), 5000);
    // `code: null` is the helper's word for "no process, no exit status" — the same answer a
    // missing git gives, and what tells `answered()` that nothing came back.
    expect(result).toEqual({ ok: false, stdout: "", code: null });
  });

  // The control: the same call shape without the NUL really does reach git, so the test above is
  // about the argument and not about the command being wrong.
  it("still runs when the argument is ordinary", async () => {
    const result = await git(["rev-parse", "--is-inside-work-tree"], process.cwd(), 5000);
    expect(result.ok).toBe(true);
    expect(result.code).toBe(0);
  });
});

describe("git() and a caller that stopped waiting", () => {
  // The panel aborts its fetch on every keystroke-after-debounce. Without a signal reaching the
  // child, that cancellation was a statement about the browser only: the `git grep` it started kept
  // running to completion or to the timeout, and a fast typist stacked them.
  it("kills the child when the signal fires, reported as no result", async () => {
    const stop = new AbortController();
    // Long enough that only the abort can end it inside the assertion's lifetime.
    const running = git(["grep", "-e", "x", "--"], process.cwd(), 60_000, stop.signal);
    stop.abort();
    // The same shape a refused spawn gives — `code: null` already means "no exit status came back",
    // so cancellation needed no new branch and no new value for callers to learn.
    await expect(running).resolves.toEqual({ ok: false, stdout: "", code: null });
  });

  // The control: the identical call with a signal that never fires must still really run git, or
  // the test above would pass for a version that cancels everything.
  it("runs normally when the signal never fires", async () => {
    const idle = new AbortController();
    const result = await git(["rev-parse", "--is-inside-work-tree"], process.cwd(), 5000, idle.signal);
    expect(result).toEqual({ ok: true, stdout: "true\n", code: 0 });
  });

  // An ALREADY-aborted signal is the race a slow spawn loses: the caller gave up between building
  // the argv and the process starting.
  it("does not run at all when the signal has already fired", async () => {
    const already = new AbortController();
    already.abort();
    await expect(git(["rev-parse", "HEAD"], process.cwd(), 5000, already.signal)).resolves.toEqual({ ok: false, stdout: "", code: null });
  });
});
