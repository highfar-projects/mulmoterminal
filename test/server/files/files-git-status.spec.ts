// @vitest-environment node
import { describe, it, expect, beforeAll } from "vitest";
import express from "express";
import { mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import path from "node:path";
import { appRequest } from "../../helpers/appRequest.js";
import { mountFilesGitStatusRoute } from "../../../server/files/files-git-status.js";
import { MAX_GIT_STATUS_ENTRIES } from "../../../common/fileGitStatus.js";
import { git } from "../../../server/git/worktrees.js";
import { makeTempDir } from "../../support/tempDir";

// #2496, against a real repository: the route runs `git status` from the pane's root.
let request: ReturnType<typeof appRequest>;
let repo: string;
let plain: string;

// The server's own git runner, so the repository is set up the way the route will read it.
const gitIn = async (dir: string, ...args: string[]): Promise<void> => {
  const res = await git(["-c", "user.email=t@example.com", "-c", "user.name=t", ...args], dir);
  if (!res.ok) throw new Error(`git ${args.join(" ")} failed in ${dir}`);
};

// Setting up the repository is several git processes; a loaded runner makes each slow.
const SETUP_TIMEOUT_MS = 60_000;

beforeAll(async () => {
  repo = makeTempDir("mt-gitstatus-");
  plain = makeTempDir("mt-gitstatus-plain-");
  await gitIn(repo, "init", "-q");
  mkdirSync(path.join(repo, "sub"), { recursive: true });
  writeFileSync(path.join(repo, "sub", "a.txt"), "a\n");
  writeFileSync(path.join(repo, "top.txt"), "t\n");
  await gitIn(repo, "add", ".");
  await gitIn(repo, "commit", "-qm", "init");
  appendFileSync(path.join(repo, "sub", "a.txt"), "more\n");
  writeFileSync(path.join(repo, "sub", "new.txt"), "n\n");
  appendFileSync(path.join(repo, "top.txt"), "more\n");
  const app = express();
  mountFilesGitStatusRoute(app, { base: (cwd) => (typeof cwd === "string" ? cwd : repo) });
  request = appRequest(app);
}, SETUP_TIMEOUT_MS);

describe("the Files tree's git status route", () => {
  it("reports every change under the repository's root", async () => {
    const res = await request(`/api/files/browse/git-status?cwd=${encodeURIComponent(repo)}`);
    expect(await res.json()).toEqual({ repo: true, files: { "sub/a.txt": "modified", "sub/new.txt": "untracked", "top.txt": "modified" } });
  });

  it("reports only what is under a pane rooted in a folder of the repository, relative to it", async () => {
    const res = await request(`/api/files/browse/git-status?cwd=${encodeURIComponent(path.join(repo, "sub"))}`);
    expect(await res.json()).toEqual({ repo: true, files: { "a.txt": "modified", "new.txt": "untracked" } });
  });

  // More changes than the tree marks: none rather than a part, so no folder reads as untouched.
  it("answers more changes than it marks with none, and says so", async () => {
    const busy = makeTempDir("mt-gitstatus-busy-");
    await gitIn(busy, "init", "-q");
    Array.from({ length: MAX_GIT_STATUS_ENTRIES + 1 }, (_, i) => writeFileSync(path.join(busy, `f${i}.txt`), "x"));
    const res = await request(`/api/files/browse/git-status?cwd=${encodeURIComponent(busy)}`);
    expect(await res.json()).toEqual({ repo: true, files: {}, truncated: true });
  });

  // The runner stops a child whose output passes the budget, so a huge status is never read whole.
  it("stops git once its output passes the byte budget", async () => {
    const many = makeTempDir("mt-gitstatus-bytes-");
    await gitIn(many, "init", "-q");
    Array.from({ length: 20 }, (_, i) => writeFileSync(path.join(many, `untracked-${i}.txt`), "x"));
    const res = await git(["status", "--porcelain=v1", "-z"], many, 15_000, undefined, 64);
    expect(res).toMatchObject({ ok: false, overflow: true, stdout: "" });
  });

  // A folder name may begin with a space; the pane's root there is still its own prefix.
  it("keeps a pane rooted in a folder whose name starts with a space", async () => {
    const spaced = makeTempDir("mt-gitstatus-spaced-");
    await gitIn(spaced, "init", "-q");
    mkdirSync(path.join(spaced, " sub"), { recursive: true });
    writeFileSync(path.join(spaced, " sub", "a.txt"), "a\n");
    await gitIn(spaced, "add", ".");
    await gitIn(spaced, "commit", "-qm", "init");
    appendFileSync(path.join(spaced, " sub", "a.txt"), "more\n");
    const res = await request(`/api/files/browse/git-status?cwd=${encodeURIComponent(path.join(spaced, " sub"))}`);
    expect(await res.json()).toEqual({ repo: true, files: { "a.txt": "modified" } });
  });

  it("says a folder outside git is not a repository", async () => {
    const res = await request(`/api/files/browse/git-status?cwd=${encodeURIComponent(plain)}`);
    expect(await res.json()).toEqual({ repo: false, files: {} });
  });
});
