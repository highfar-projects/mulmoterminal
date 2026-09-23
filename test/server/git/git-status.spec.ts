// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { makeTempDir } from "../../support/tempDir.js";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { gitStatus } from "../../../server/git/git-status.js";

describe("gitStatus", () => {
  let repo: string;
  const hasGit = (() => {
    try {
      // eslint-disable-next-line sonarjs/no-os-command-from-path -- 'git' from PATH in a test; argv only, no shell
      execFileSync("git", ["--version"], { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  })();

  const g = (dir: string, ...a: string[]) =>
    // eslint-disable-next-line sonarjs/no-os-command-from-path -- 'git' from PATH in a test; argv only, no shell
    execFileSync("git", ["-C", dir, ...a], { stdio: "ignore" });

  beforeEach(() => {
    repo = makeTempDir("mt-gitstatus-");
    if (!hasGit) return;
    g(repo, "init", "-b", "main");
    g(repo, "config", "user.email", "t@t.t");
    g(repo, "config", "user.name", "t");
    writeFileSync(path.join(repo, "README.md"), "hi\n");
    g(repo, "add", "-A");
    g(repo, "commit", "-m", "init");
  });
  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  // #2164. Every cell open on a checkout polls this, and one read costs four git processes over
  // the whole worktree. Overlapping reads must become ONE — coalesced callers share the very
  // promise, so they get the same object back; two separate reads each build their own.
  // Codex review on #2166. A cell's cwd is whatever the launch panel was given — it can be a
  // SUBDIRECTORY of a repo another cell already has open, and it is then recorded as a preset.
  // Keyed by the cwd string those two would each run their own read of one worktree; keyed by the
  // top level they share it. The answer is the same either way: `git status --porcelain`, the
  // branch and ahead/behind do not vary with the directory you stand in inside a worktree.
  // Same ANSWER, deliberately not the same object. Two different cwds are only known to share a
  // worktree once `rev-parse` has answered for each, so whether they join is a matter of which
  // resolved first — asserting identity here passed on timing and failed on a loaded runner
  // (#2196). What is guaranteed is keyed on the top level and pinned deterministically in
  // git-status-coalesce.spec.ts; this one pins the value.
  it.skipIf(!hasGit)("serves two different cwds of ONE worktree the same answer", async () => {
    const sub = path.join(repo, "nested", "deeper");
    mkdirSync(sub, { recursive: true });
    const [fromRoot, fromSub] = await Promise.all([gitStatus(repo), gitStatus(sub)]);
    expect(fromRoot).toEqual(fromSub);
  });

  it.skipIf(!hasGit)("gives a subdirectory the same answer as the worktree root", async () => {
    const sub = path.join(repo, "nested2");
    mkdirSync(sub, { recursive: true });
    writeFileSync(path.join(repo, "dirty.txt"), "x\n");
    const fromRoot = await gitStatus(repo);
    const fromSub = await gitStatus(sub);
    expect(fromSub).toEqual(fromRoot);
    expect(fromSub.dirty).toBeGreaterThan(0);
  });

  it.skipIf(!hasGit)("serves overlapping reads of one dir from a single run", async () => {
    const [first, second] = await Promise.all([gitStatus(repo), gitStatus(repo)]);
    expect(first).toBe(second);
  });

  // Within the TTL a settled answer is served from the cache (server/git/git-status.ts), so the
  // forced post-turn read is what must run again.
  it.skipIf(!hasGit)("reads again on a fresh read once the previous read has settled", async () => {
    const first = await gitStatus(repo);
    const second = await gitStatus(repo, { fresh: true });
    expect(second).not.toBe(first);
    expect(second).toEqual(first);
  });

  it("reports repo:false for a non-git dir", async () => {
    const outside = makeTempDir("mt-nogit-");
    const s = await gitStatus(outside);
    expect(s.repo).toBe(false);
    rmSync(outside, { recursive: true, force: true });
  });

  it.skipIf(!hasGit)("reports branch and a clean tree", async () => {
    const s = await gitStatus(repo);
    expect(s.repo).toBe(true);
    expect(s.branch).toBe("main");
    expect(s.detached).toBe(false);
    expect(s.dirty).toBe(0);
    expect(s.upstream).toBe(false); // no remote in the test repo
  });

  it.skipIf(!hasGit)("shows the branch on an unborn branch (git init, no commit yet)", async () => {
    const fresh = makeTempDir("mt-unborn-");
    g(fresh, "init", "-b", "main"); // no commit — unborn HEAD
    const s = await gitStatus(fresh);
    expect(s.repo).toBe(true);
    expect(s.branch).toBe("main");
    expect(s.detached).toBe(false);
    rmSync(fresh, { recursive: true, force: true });
  });

  it.skipIf(!hasGit)("counts dirty entries (modified + untracked)", async () => {
    writeFileSync(path.join(repo, "README.md"), "changed\n"); // modify tracked
    writeFileSync(path.join(repo, "new.txt"), "new\n"); // untracked
    const s = await gitStatus(repo);
    expect(s.dirty).toBe(2);
  });

  it.skipIf(!hasGit)("reports detached HEAD", async () => {
    writeFileSync(path.join(repo, "b.txt"), "b\n");
    g(repo, "add", "-A");
    g(repo, "commit", "-m", "second");
    g(repo, "checkout", "--detach", "HEAD");
    const s = await gitStatus(repo);
    expect(s.detached).toBe(true);
    expect(s.branch).toBeNull();
  });

  it.skipIf(!hasGit)("reports ahead vs a local upstream", async () => {
    // A second clone acting as the "remote" so HEAD has an upstream to be ahead of.
    const remote = makeTempDir("mt-remote-");
    g(repo, "clone", "--bare", repo, remote);
    g(repo, "remote", "add", "origin", remote);
    g(repo, "push", "-u", "origin", "main");
    writeFileSync(path.join(repo, "c.txt"), "c\n");
    g(repo, "add", "-A");
    g(repo, "commit", "-m", "ahead by one");
    const s = await gitStatus(repo);
    expect(s.upstream).toBe(true);
    expect(s.ahead).toBe(1);
    expect(s.behind).toBe(0);
    rmSync(remote, { recursive: true, force: true });
  });
});
