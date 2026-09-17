// @vitest-environment node
import { describe, it, expect } from "vitest";
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

  // A link pointing at an ancestor is a walk that never ends. The link itself is still offered:
  // opening it resolves through the route's containment check, which is where that belongs.
  it("offers a symlink without following it", async () => {
    const dir = tmp();
    write(dir, "real.ts");
    symlinkSync(dir, path.join(dir, "loop"));
    const index = await listProjectFiles(dir);
    expect(index.paths).toEqual(["loop", "real.ts"]);
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
});
