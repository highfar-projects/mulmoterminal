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
