// @vitest-environment node
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { makeTempDir } from "../../support/tempDir.js";
import { listProjectFiles } from "../../../server/files/project-files";

const tmp = () => makeTempDir("mt-index-");

const write = (dir: string, rel: string, text = "x"): void => {
  const abs = path.join(dir, rel);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, text);
};

const git = (dir: string, ...args: string[]): void => {
  // eslint-disable-next-line sonarjs/no-os-command-from-path -- 'git' from PATH in a test; argv only, no shell
  execFileSync("git", ["-C", dir, ...args], { stdio: "ignore" });
};

/** A real repository, because the whole point of the git branch is that GIT decides what is
 *  ignored — a fake would only test the parser we deliberately do not have. */
const repo = (): string => {
  const dir = tmp();
  git(dir, "init", "-q");
  git(dir, "config", "user.email", "spec@example.com");
  git(dir, "config", "user.name", "spec");
  return dir;
};

describe("listProjectFiles — in a git repository", () => {
  it("lists tracked and untracked files, and says git answered", async () => {
    const dir = repo();
    write(dir, "src/a.ts");
    write(dir, "README.md");
    git(dir, "add", "README.md");
    const index = await listProjectFiles(dir);
    expect(index.source).toBe("git");
    expect(index.paths).toEqual(["README.md", "src/a.ts"]);
  });

  // The request in #2099: node_modules must not be among the candidates.
  it("leaves out what .gitignore excludes", async () => {
    const dir = repo();
    write(dir, ".gitignore", "node_modules/\n*.log\n");
    write(dir, "node_modules/pkg/index.js");
    write(dir, "debug.log");
    write(dir, "src/a.ts");
    const index = await listProjectFiles(dir);
    expect(index.paths).toEqual([".gitignore", "src/a.ts"]);
  });

  // A nested ignore file is one of the reasons this asks git instead of reading `.gitignore`.
  it("honours an ignore file deeper in the tree", async () => {
    const dir = repo();
    write(dir, "pkg/.gitignore", "build/\n");
    write(dir, "pkg/build/out.js");
    write(dir, "pkg/src/a.ts");
    const index = await listProjectFiles(dir);
    expect(index.paths).toEqual(["pkg/.gitignore", "pkg/src/a.ts"]);
  });

  it("never lists .git itself", async () => {
    const dir = repo();
    write(dir, "a.ts");
    const index = await listProjectFiles(dir);
    expect(index.paths.some((p) => p.startsWith(".git/"))).toBe(false);
  });

  // The finder hands what it picks to the tree and the editor, which resolve against the pane's
  // ROOT. Asked about a subdirectory, the paths have to be relative to THAT — which is what
  // running git with `-C` buys, and what a repo-relative listing would get wrong at every depth.
  it("answers relative to the directory it was asked about, not the repository root", async () => {
    const dir = repo();
    write(dir, "pkg/sub/a.ts");
    write(dir, "outside.ts");
    const index = await listProjectFiles(path.join(dir, "pkg"));
    expect(index.paths).toEqual(["sub/a.ts"]);
  });

  // `git ls-files --cached` lists a tracked submodule as an ordinary index entry, but the path is a
  // DIRECTORY — the editor route answers 400 for one, so offering it is a row that opens nothing.
  // The gitlink is written straight into the index rather than through `git submodule add`, which
  // would need a remote to clone from (CodeRabbit on #2102).
  it("leaves out a tracked submodule, whose path is a directory", async () => {
    const dir = repo();
    write(dir, "src/a.ts");
    git(dir, "add", "src/a.ts");
    git(dir, "update-index", "--add", "--cacheinfo", "160000,0000000000000000000000000000000000000001,vendor/lib");
    const index = await listProjectFiles(dir);
    expect(index.paths).toEqual(["src/a.ts"]);
  });

  it("puts the tracked and the untracked halves together, complete", async () => {
    const dir = repo();
    write(dir, "src/a.ts");
    git(dir, "add", "src/a.ts");
    write(dir, "untracked.ts");
    expect(await listProjectFiles(dir)).toEqual({ paths: ["src/a.ts", "untracked.ts"], truncated: false, source: "git" });
  });

  it("keeps a path holding a space or a non-ASCII name intact", async () => {
    const dir = repo();
    write(dir, "docs/my notes.md");
    write(dir, "docs/日本語.md");
    const index = await listProjectFiles(dir);
    expect(index.paths).toEqual(["docs/my notes.md", "docs/日本語.md"]);
  });
});

describe("listProjectFiles — where git has nothing to say", () => {
  it("walks the directory and says so, so the UI can admit .gitignore was not applied", async () => {
    const dir = tmp();
    write(dir, "a.ts");
    write(dir, "deep/b/c.ts");
    const index = await listProjectFiles(dir);
    expect(index.source).toBe("walk");
    expect(index.paths).toEqual(["a.ts", "deep/b/c.ts"]);
  });

  it("does not descend into the directories that are never worth walking", async () => {
    const dir = tmp();
    write(dir, "node_modules/pkg/index.js");
    write(dir, "src/a.ts");
    const index = await listProjectFiles(dir);
    expect(index.paths).toEqual(["src/a.ts"]);
  });

  // A link pointing at an ancestor is a walk that never ends.
  it("does not follow a symlinked directory, and does not offer it either", async () => {
    const dir = tmp();
    write(dir, "real.ts");
    symlinkSync(dir, path.join(dir, "loop"));
    const index = await listProjectFiles(dir);
    expect(index.paths).toEqual(["real.ts"]);
  });

  // The file it points at opens normally; the route's containment check is what refuses one that
  // leaves the project, and that belongs there rather than here.
  it("offers a symlink that resolves to a file", async () => {
    const dir = tmp();
    write(dir, "real.ts");
    symlinkSync(path.join(dir, "real.ts"), path.join(dir, "alias.ts"));
    const index = await listProjectFiles(dir);
    expect(index.paths).toEqual(["alias.ts", "real.ts"]);
  });

  // A row that opens nothing is worse than a row that is absent.
  it("leaves out a broken symlink", async () => {
    const dir = tmp();
    write(dir, "real.ts");
    symlinkSync(path.join(dir, "gone.ts"), path.join(dir, "dangling.ts"));
    const index = await listProjectFiles(dir);
    expect(index.paths).toEqual(["real.ts"]);
  });

  it("reports nothing for an empty directory rather than failing", async () => {
    expect(await listProjectFiles(tmp())).toEqual({ paths: [], truncated: false, source: "walk" });
  });

  it("survives a directory it cannot read", async () => {
    const dir = tmp();
    write(dir, "a.ts");
    expect((await listProjectFiles(path.join(dir, "missing"))).paths).toEqual([]);
  });
});

describe("listProjectFiles — the cap", () => {
  it("cuts the list and SAYS it cut it", async () => {
    const dir = tmp();
    ["a.ts", "b.ts", "c.ts"].forEach((name) => write(dir, name));
    const index = await listProjectFiles(dir, 2);
    expect(index).toEqual({ paths: ["a.ts", "b.ts"], truncated: true, source: "walk" });
  });

  it("is not truncated when the list exactly fills the cap", async () => {
    const dir = tmp();
    ["a.ts", "b.ts"].forEach((name) => write(dir, name));
    expect((await listProjectFiles(dir, 2)).truncated).toBe(false);
  });

  // The walk can stop on its ENTRY budget while holding fewer paths than the cap — a directory of
  // directories spends the budget without yielding files. The array's own length cannot reveal
  // that, so an incomplete list would be reported as the whole project (CodeRabbit on #2102).
  it("says it is truncated when the walk ran out of budget, even below the path cap", async () => {
    const dir = tmp();
    ["deep/a/one.ts", "deep/b/two.ts", "deep/c/three.ts"].forEach((rel) => write(dir, rel));
    const index = await listProjectFiles(dir, 1000, 3);
    expect(index.paths.length).toBeLessThan(1000);
    expect(index.truncated).toBe(true);
  });

  it("is not truncated when the walk finished inside its budget", async () => {
    const dir = tmp();
    write(dir, "a.ts");
    expect((await listProjectFiles(dir, 1000, 1000)).truncated).toBe(false);
  });
});

// The one branch a real repository cannot be talked into: the tracked half answers and the
// untracked half does not. Falling back to the walk there would put `node_modules` in front of
// someone whose repository plainly has a `.gitignore`, which is worse than a list that is short
// and says so.
//
// `vi.doMock` is not hoisted, so the module under test is imported INSIDE the case — the exception
// this repo's CLAUDE.md names for exactly this shape.
describe("listProjectFiles — when only half of git answers", () => {
  // BEFORE the mock, not after: this file already imported the module under test at the top, so
  // its graph is cached with the real `git` in it. Clearing first is what makes the dynamic import
  // below re-evaluate against the mock rather than hand back the cached copy.
  beforeEach(() => vi.resetModules());
  afterEach(() => {
    vi.doUnmock("../../../server/git/worktrees.js");
    vi.resetModules();
  });

  it("keeps the tracked half and reports it as partial", async () => {
    vi.doMock("../../../server/git/worktrees.js", () => ({
      git: async (args: string[]) => (args.includes("--stage") ? { ok: true, stdout: "100644 abc 0\tsrc/a.ts\0" } : { ok: false, stdout: "" }),
    }));
    const { listProjectFiles: subject } = await import("../../../server/files/project-files");
    expect(await subject(tmp())).toEqual({ paths: ["src/a.ts"], truncated: true, source: "git" });
  });

  it("falls back to the walk when git cannot answer at all", async () => {
    vi.doMock("../../../server/git/worktrees.js", () => ({ git: async () => ({ ok: false, stdout: "" }) }));
    const { listProjectFiles: subject } = await import("../../../server/files/project-files");
    const dir = tmp();
    write(dir, "only.ts");
    expect(await subject(dir)).toEqual({ paths: ["only.ts"], truncated: false, source: "walk" });
  });
});
