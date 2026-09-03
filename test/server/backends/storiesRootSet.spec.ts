// @vitest-environment node
// WHICH directories become stories roots (#1951). The whole containment decision is this function,
// so it is tested apart from the fs walk that feeds it.
import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { uniqueRootPaths, isDirectory, MAX_ROOTS } from "../../../server/backends/storiesRootSet";

const always = () => true;

describe("choosing the root directories", () => {
  it("keeps the order it was given, workspace first", () => {
    expect(uniqueRootPaths(["/work/ws", "/work/a", "/work/b"], always)).toEqual(["/work/ws", "/work/a", "/work/b"]);
  });

  // Not cosmetic: the ids come from the resolved path, and the plugin THROWS on a duplicate id.
  // The workspace arrives as the launcher spelled it and a preset as the user saved it, so one
  // directory reaches here twice under two spellings.
  it("drops a directory already registered under another spelling", () => {
    expect(uniqueRootPaths(["/work/ws", "/work/ws/", "/work/ws/../ws", "/work/other"], always)).toEqual(["/work/ws", "/work/other"]);
  });

  it("drops empty and whitespace entries", () => {
    expect(uniqueRootPaths(["/work/ws", "", "   ", "/work/a"], always)).toEqual(["/work/ws", "/work/a"]);
  });

  // A preset for a repository since deleted must register nothing: the plugin resolves against the
  // path, and a root that is not there answers every request under it with an error nobody can act
  // on.
  it("drops a directory that is not there", () => {
    const exists = (dir: string) => dir !== "/work/gone";
    expect(uniqueRootPaths(["/work/ws", "/work/gone", "/work/a"], exists)).toEqual(["/work/ws", "/work/a"]);
  });

  // The first entry is the workspace — the caller's own launch directory, which the browser reads
  // as "the root addressed without an id". Dropping it silently promotes a saved preset into that
  // position, so the file tree would start treating another project's `artifacts/stories` as the
  // default one. Observed by reading the registration back, not flagged by a review bot (#1951).
  it("keeps the workspace even when it is not on disk, and still drops a missing preset", () => {
    const exists = () => false;
    expect(uniqueRootPaths(["/work/ws", "/work/gone"], exists)).toEqual(["/work/ws"]);
  });

  it("stops at the ceiling", () => {
    const many = Array.from({ length: MAX_ROOTS + 10 }, (_, i) => `/work/p${String(i).padStart(3, "0")}`);
    const kept = uniqueRootPaths(many, always);
    expect(kept).toHaveLength(MAX_ROOTS);
    expect(kept[0]).toBe("/work/p000"); // the workspace's place is first, and it is kept
  });

  it("keeps the documented ceiling", () => {
    expect(MAX_ROOTS).toBe(64);
  });
});

describe("isDirectory, against a real filesystem", () => {
  it("answers for a directory, a file, a missing path and a symlink to one", () => {
    const base = mkdtempSync(path.join(tmpdir(), "rootset-"));
    try {
      const dir = path.join(base, "repo");
      const file = path.join(base, "notes.txt");
      const link = path.join(base, "link");
      mkdirSync(dir);
      writeFileSync(file, "x");
      symlinkSync(dir, link);
      expect(isDirectory(dir)).toBe(true);
      expect(isDirectory(link)).toBe(true); // a worktree reached through a symlink is still a root
      expect(isDirectory(file)).toBe(false);
      expect(isDirectory(path.join(base, "nope"))).toBe(false);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });
});
