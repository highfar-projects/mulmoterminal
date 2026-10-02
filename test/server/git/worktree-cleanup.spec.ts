// @vitest-environment node
// The facts behind the Processes page's worktree list, read from a real repository: merged or not,
// dirty or not, and in use when a pane stands in it. The session sources are stubbed; git is not.
import { makeTempDir } from "../../support/tempDir.js";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { rmDirRetrying, GIT_TEST_TIMEOUT_MS } from "./wtTestUtil.js";
import type { Express } from "express";

const paneCwds = vi.hoisted(() => ({ value: [] as string[] | null, tmuxInstalled: true }));
vi.mock("../../../server/infra/tmux.js", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  tmuxAttachedCounts: () => null,
  tmuxPaneCwdsAsync: async () => paneCwds.value,
  tmuxAvailable: () => paneCwds.tmuxInstalled,
}));
vi.mock("../../../server/session/dir-session.js", () => ({
  dirSession: async () => null,
  survivorSnapshot: async () => new Set<string>(),
}));
vi.mock("../../../server/session/registry.js", () => ({ ptys: new Map([["p", { cwd: "/nowhere" }]]) }));

const { git, repoRoot, worktreesRoot } = await import("../../../server/git/worktrees");
const { canonicalPath } = await import("../../../server/infra/canonical-path");
// git spells a path its own way (forward slashes, long names on Windows), so rows are matched as
// the server matches them: canonically.
const samePath = (a: string, b: string): boolean => canonicalPath(a) === canonicalPath(b);
const { deleteBranchIfAt, worktreeCleanupRows } = await import("../../../server/git/worktree-cleanup");
const { mountWorktreeRoutes } = await import("../../../server/git/worktree-routes");

/** POST /api/worktrees/cleanup/remove through the real route, without an HTTP server. */
async function removeCandidate(body: unknown): Promise<{ status: number; payload: unknown }> {
  let handler: ((req: object, res: object) => Promise<unknown>) | undefined;
  const app = {
    get: () => undefined,
    post: (p: string, h: (req: object, res: object) => Promise<unknown>) => {
      if (p === "/api/worktrees/cleanup/remove") handler = h;
    },
  } as unknown as Express;
  mountWorktreeRoutes(app, { isAllowedOrigin: () => true });
  const out = { status: 200, payload: undefined as unknown };
  const res = {
    status(code: number) {
      out.status = code;
      return this;
    },
    json(payload: unknown) {
      out.payload = payload;
      return this;
    },
    end() {
      return this;
    },
  };
  await handler?.({ headers: {}, body, method: "POST", path: "/api/worktrees/cleanup/remove" }, res);
  return out;
}

const gitIn = async (dir: string, ...args: string[]): Promise<void> => {
  const result = await git(args, dir);
  if (!result.ok) throw new Error(`git ${args.join(" ")} failed in ${dir}`);
};
const hasGit = (await git(["--version"], process.cwd())).ok;

/** A managed worktree on a new branch, without createWorktree's port and config work. The root is
 *  keyed off git's own spelling of the repo, as createWorktree keys it — on Windows that differs
 *  from the temp dir's, and so would the hash in the root's name. */
async function addWorktree(repo: string, name: string): Promise<{ path: string }> {
  const toplevel = await repoRoot(repo);
  if (toplevel === null) throw new Error(`${repo} is not a repository`);
  const wtPath = path.join(worktreesRoot(toplevel), name);
  await gitIn(repo, "worktree", "add", "-b", `agent/${name}`, wtPath);
  return { path: wtPath };
}

describe("worktreeCleanupRows", () => {
  let home = "";
  let repo = "";

  beforeEach(async () => {
    home = makeTempDir("mt-wtc-home-");
    process.env.MULMOTERMINAL_HOME = home;
    repo = makeTempDir("mt-wtc-repo-");
    paneCwds.value = [];
    paneCwds.tmuxInstalled = true;
    if (!hasGit) return;
    await gitIn(repo, "init", "-b", "main");
    await gitIn(repo, "config", "user.email", "t@t.t");
    await gitIn(repo, "config", "user.name", "t");
    writeFileSync(path.join(repo, "a.txt"), "a\n");
    await gitIn(repo, "add", "a.txt");
    await gitIn(repo, "commit", "-m", "init");
  });

  afterEach(() => {
    delete process.env.MULMOTERMINAL_HOME;
    rmDirRetrying(home);
    rmDirRetrying(repo);
  });

  const rowFor = async (wtPath: string) => (await worktreeCleanupRows([repo])).find((row) => samePath(row.path, wtPath));

  it.skipIf(!hasGit)(
    "reads merged, dirty, and unmerged worktrees apart",
    async () => {
      const merged = await addWorktree(repo, "merged");
      const dirty = await addWorktree(repo, "dirty");
      const ahead = await addWorktree(repo, "ahead");
      writeFileSync(path.join(dirty.path, "untracked.txt"), "x\n");
      writeFileSync(path.join(ahead.path, "b.txt"), "b\n");
      await gitIn(ahead.path, "add", "b.txt");
      await gitIn(ahead.path, "commit", "-m", "work");

      const rows = await worktreeCleanupRows([repo]);
      const rowAt = (wtPath: string) => rows.find((row) => samePath(row.path, wtPath));
      expect(samePath(rowAt(merged.path)?.repo ?? "", repo)).toBe(true);
      expect(rowAt(merged.path)).toMatchObject({ base: "main", exists: true, dirty: false, merged: true, inUse: false });
      expect(rowAt(dirty.path)).toMatchObject({ dirty: true, merged: true });
      expect(rowAt(ahead.path)).toMatchObject({ dirty: false, merged: false });
    },
    GIT_TEST_TIMEOUT_MS,
  );

  it.skipIf(!hasGit)(
    "names gitignored files without counting them as dirty, since removal deletes them anyway",
    async () => {
      writeFileSync(path.join(repo, ".gitignore"), ".env\nbuild/\n");
      await gitIn(repo, "add", ".gitignore");
      await gitIn(repo, "commit", "-m", "ignore");
      const wt = await addWorktree(repo, "ignored");
      writeFileSync(path.join(wt.path, ".env"), "SECRET=1\n");
      mkdirSync(path.join(wt.path, "build"));
      writeFileSync(path.join(wt.path, "build", "out.js"), "x\n");
      expect(await rowFor(wt.path)).toMatchObject({ dirty: false, ignored: [".env", "build/"], ignoredCount: 2 });
    },
    GIT_TEST_TIMEOUT_MS,
  );

  it.skipIf(!hasGit)(
    "counts a pane standing anywhere inside the worktree as in use",
    async () => {
      const wt = await addWorktree(repo, "used");
      const sub = path.join(wt.path, "src");
      mkdirSync(sub);
      paneCwds.value = [sub];
      expect((await rowFor(wt.path))?.inUse).toBe(true);
    },
    GIT_TEST_TIMEOUT_MS,
  );

  it.skipIf(!hasGit)(
    "counts every worktree as in use when tmux is installed but cannot answer",
    async () => {
      const wt = await addWorktree(repo, "unknown");
      paneCwds.value = null;
      expect((await rowFor(wt.path))?.inUse).toBe(true);
    },
    GIT_TEST_TIMEOUT_MS,
  );

  it.skipIf(!hasGit)(
    "reads this process's terminals as every pane there is when tmux is not installed",
    async () => {
      const wt = await addWorktree(repo, "notmux");
      paneCwds.value = null;
      paneCwds.tmuxInstalled = false;
      expect((await rowFor(wt.path))?.inUse).toBe(false);
    },
    GIT_TEST_TIMEOUT_MS,
  );

  it.skipIf(!hasGit)(
    "removes a candidate and its branch, reading it again at removal time",
    async () => {
      const wt = await addWorktree(repo, "done");
      expect(await removeCandidate({ repoDir: repo, path: wt.path })).toEqual({ status: 200, payload: { ok: true, branchDeleted: true } });
      expect(existsSync(wt.path)).toBe(false);
      expect((await git(["rev-parse", "--verify", "--quiet", "agent/done"], repo)).ok).toBe(false);
    },
    GIT_TEST_TIMEOUT_MS,
  );

  it.skipIf(!hasGit)(
    "refuses a worktree that gained a commit or a terminal since the list was read, keeping it and its branch",
    async () => {
      const ahead = await addWorktree(repo, "ahead");
      const used = await addWorktree(repo, "used");
      expect((await worktreeCleanupRows([repo])).every((row) => row.merged && !row.inUse)).toBe(true);
      writeFileSync(path.join(ahead.path, "b.txt"), "b\n");
      await gitIn(ahead.path, "add", "b.txt");
      await gitIn(ahead.path, "commit", "-m", "work");
      paneCwds.value = [used.path];

      expect(await removeCandidate({ repoDir: repo, path: ahead.path })).toEqual({ status: 409, payload: { blockers: ["unmerged"] } });
      expect(await removeCandidate({ repoDir: repo, path: used.path })).toEqual({ status: 409, payload: { blockers: ["inUse"] } });
      expect(existsSync(ahead.path) && existsSync(used.path)).toBe(true);
      expect((await git(["rev-parse", "--verify", "--quiet", "agent/ahead"], repo)).ok).toBe(true);
    },
    GIT_TEST_TIMEOUT_MS,
  );

  it.skipIf(!hasGit)(
    "deletes a branch only while it is still at the commit found merged",
    async () => {
      const wt = await addWorktree(repo, "moved");
      const checked = (await worktreeCleanupRows([repo])).find((row) => samePath(row.path, wt.path));
      if (!checked) throw new Error("worktree was not listed");
      writeFileSync(path.join(wt.path, "late.txt"), "late\n");
      await gitIn(wt.path, "add", "late.txt");
      await gitIn(wt.path, "commit", "-m", "after the check");

      expect(await deleteBranchIfAt(repo, "agent/moved", checked.head)).toBe(false);
      expect((await git(["rev-parse", "--verify", "--quiet", "agent/moved"], repo)).ok).toBe(true);
      const now = await git(["rev-parse", "agent/moved"], repo);
      expect(await deleteBranchIfAt(repo, "agent/moved", now.stdout.trim())).toBe(true);
    },
    GIT_TEST_TIMEOUT_MS,
  );

  it.skipIf(!hasGit)(
    "404s a path that is not one of the repo's managed worktrees",
    async () => {
      expect((await removeCandidate({ repoDir: repo, path: repo })).status).toBe(404);
    },
    GIT_TEST_TIMEOUT_MS,
  );

  it("lists nothing for folders that are gone or not repositories", async () => {
    expect(await worktreeCleanupRows([path.join(home, "missing"), home])).toEqual([]);
  });
});
