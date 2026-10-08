// @vitest-environment node
import { describe, it, expect } from "vitest";
import { mkdirSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import path from "node:path";
import { makeTempDir } from "../../../support/tempDir.js";
import { listDeclaredFiles, resolveRequestedFile } from "../../../../server/backends/remoteHost/mobileFileWalk";
import type { MobileFilesConfig } from "../../../../server/config/dir/dir-config";

function project(): { root: string; config: MobileFilesConfig; write: (rel: string, ageSeconds?: number) => void } {
  const root = makeTempDir("mt-mobile-");
  mkdirSync(path.join(root, "output"));
  const write = (rel: string, ageSeconds = 0) => {
    const file = path.join(root, rel);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, "x");
    const at = new Date(Date.now() - ageSeconds * 1000);
    utimesSync(file, at, at);
  };
  return { root, config: { dirs: [path.join(root, "output")], extensions: ["md", "pdf"] }, write };
}

describe("listDeclaredFiles", () => {
  it("lists declared extensions newest first, relative to the project", async () => {
    const { root, config, write } = project();
    write("output/old.md", 100);
    write("output/sub/new.pdf", 1);
    write("output/skip.html");
    write("elsewhere.md");
    const { files, truncated } = await listDeclaredFiles(root, config);
    expect(files.map((file) => file.path)).toEqual(["output/sub/new.pdf", "output/old.md"]);
    expect(files[0]).toMatchObject({ kind: "pdf", bytes: 1 });
    expect(truncated).toBe(false);
  });

  it("never lists hidden files, hidden directories or node_modules", async () => {
    const { root, config, write } = project();
    write("output/.secret.md");
    write("output/.git/x.md");
    write("output/node_modules/pkg/readme.md");
    expect((await listDeclaredFiles(root, config)).files).toEqual([]);
  });

  it("does not follow a symlink out of the declared directory", async () => {
    const { root, config, write } = project();
    write("private/secret.md");
    symlinkSync(path.join(root, "private"), path.join(root, "output", "link"));
    symlinkSync(path.join(root, "private", "secret.md"), path.join(root, "output", "file.md"));
    expect((await listDeclaredFiles(root, config)).files).toEqual([]);
  });
});

describe("resolveRequestedFile", () => {
  it("resolves a declared file", async () => {
    const { root, config, write } = project();
    write("output/a.md");
    expect(await resolveRequestedFile(root, config, "output/a.md")).toBe(path.join(root, "output", "a.md"));
  });

  it.each([
    ["outside the declared directory", "notes.md"],
    ["an undeclared extension", "output/a.html"],
    ["a hidden file", "output/.a.md"],
    ["a climb out", "output/../notes.md"],
    ["an absolute path", "/etc/hosts"],
    ["a backslash path", "output\\a.md"],
    ["a file under node_modules", "output/node_modules/a.md"],
    ["an empty path", ""],
    ["a missing file", "output/none.md"],
  ])("refuses %s", async (_label, requested) => {
    const { root, config, write } = project();
    write("notes.md");
    write("output/a.html");
    write("output/.a.md");
    write("output/node_modules/a.md");
    expect(await resolveRequestedFile(root, config, requested)).toBeNull();
  });

  it.each([[42], [null], [{ path: "output/a.md" }]])("refuses a non-string (%j)", async (requested) => {
    const { root, config } = project();
    expect(await resolveRequestedFile(root, config, requested)).toBeNull();
  });

  it("refuses a symlink that points out, though its name is declared", async () => {
    const { root, config, write } = project();
    write("private/secret.md");
    symlinkSync(path.join(root, "private", "secret.md"), path.join(root, "output", "a.md"));
    expect(await resolveRequestedFile(root, config, "output/a.md")).toBeNull();
  });
});
