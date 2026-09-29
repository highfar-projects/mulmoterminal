// @vitest-environment node
import { describe, it, expect, beforeAll } from "vitest";
import express from "express";
import { mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import path from "node:path";
import { appRequest } from "../../helpers/appRequest.js";
import { mountFilesGitStatusRoute } from "../../../server/files/files-git-status.js";
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
});

describe("the Files tree's git status route", () => {
  it("reports every change under the repository's root", async () => {
    const res = await request(`/api/files/browse/git-status?cwd=${encodeURIComponent(repo)}`);
    expect(await res.json()).toEqual({ repo: true, files: { "sub/a.txt": "modified", "sub/new.txt": "untracked", "top.txt": "modified" } });
  });

  it("reports only what is under a pane rooted in a folder of the repository, relative to it", async () => {
    const res = await request(`/api/files/browse/git-status?cwd=${encodeURIComponent(path.join(repo, "sub"))}`);
    expect(await res.json()).toEqual({ repo: true, files: { "a.txt": "modified", "new.txt": "untracked" } });
  });

  it("says a folder outside git is not a repository", async () => {
    const res = await request(`/api/files/browse/git-status?cwd=${encodeURIComponent(plain)}`);
    expect(await res.json()).toEqual({ repo: false, files: {} });
  });
});
