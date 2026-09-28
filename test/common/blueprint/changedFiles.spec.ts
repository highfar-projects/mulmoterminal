import { describe, it, expect } from "vitest";
import { isSkippedName, changedFiles, CHANGED_FILES_MAX, type FolderEntry } from "../../../common/blueprint/changedFiles";

const SINCE_MS = 1000;

const read = (entries: readonly FolderEntry[]) => ({ entries, complete: true });

describe("changedFiles", () => {
  it("keeps the files changed at or after the build began, in path order", () => {
    const entries = [
      { path: "b.md", mtimeMs: SINCE_MS + 1 },
      { path: "a.md", mtimeMs: SINCE_MS },
      { path: "old.md", mtimeMs: SINCE_MS - 1 },
      { path: "notes/c.md", mtimeMs: SINCE_MS + 2 },
    ];
    expect(changedFiles(read(entries), SINCE_MS)).toEqual({ files: ["a.md", "b.md", "notes/c.md"], more: false });
  });

  it("orders by character code, not by the machine's locale", () => {
    const entries = ["b.md", "B.md", "a.md", "É.md"].map((path) => ({ path, mtimeMs: SINCE_MS }));
    expect(changedFiles(read(entries), SINCE_MS).files).toEqual(["B.md", "a.md", "b.md", "É.md"]);
  });

  it("leaves out anything under a hidden folder or installed packages, whoever handed it in", () => {
    const entries = [".blueprint/findings.json", "src/.cache/x", "node_modules/p/index.js", "app/node_modules/q.js", ".env", "kept.txt"].map((path) => ({
      path,
      mtimeMs: SINCE_MS,
    }));
    expect(changedFiles(read(entries), SINCE_MS).files).toEqual(["kept.txt"]);
  });

  it("holds at most the cap, and says when there were more", () => {
    const entries = (count: number) =>
      Array.from({ length: count }, (_unused, index) => ({ path: `f${String(index).padStart(3, "0")}.md`, mtimeMs: SINCE_MS }));
    expect(changedFiles(read(entries(CHANGED_FILES_MAX)), SINCE_MS)).toMatchObject({ more: false });
    const over = changedFiles(read(entries(CHANGED_FILES_MAX + 1)), SINCE_MS);
    expect(over.files).toHaveLength(CHANGED_FILES_MAX);
    expect(over.more).toBe(true);
    expect(changedFiles(read(entries(3)), SINCE_MS, 2)).toEqual({ files: ["f000.md", "f001.md"], more: true });
  });

  it("says there may be more when the walk stopped before reading everything, even with nothing found", () => {
    expect(changedFiles({ entries: [], complete: false }, SINCE_MS)).toEqual({ files: [], more: true });
    expect(changedFiles({ entries: [{ path: "a.md", mtimeMs: SINCE_MS }], complete: false }, SINCE_MS)).toEqual({ files: ["a.md"], more: true });
  });

  it("is empty for an empty folder or one nothing changed in", () => {
    expect(changedFiles(read([]), SINCE_MS)).toEqual({ files: [], more: false });
    expect(changedFiles(read([{ path: "a.md", mtimeMs: 0 }]), SINCE_MS)).toEqual({ files: [], more: false });
  });
});

describe("isSkippedName", () => {
  it.each([
    [".git", true],
    [".blueprint", true],
    ["node_modules", true],
    ["notes", false],
    ["node_modules_old", false],
    ["a.md", false],
  ])("%s -> %s", (name, skipped) => {
    expect(isSkippedName(name)).toBe(skipped);
  });
});
