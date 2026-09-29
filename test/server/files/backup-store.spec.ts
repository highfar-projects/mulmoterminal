// @vitest-environment node
import { describe, it, expect } from "vitest";
import { writeFileSync, readFileSync, readdirSync, rmSync, existsSync } from "node:fs";
import path from "node:path";
import { makeTempDir } from "../../support/tempDir";
import {
  backupDirFor,
  expiredBackups,
  storeBackup,
  backupCurrentFile,
  BACKUP_GENERATIONS,
  backupTakenAt,
  backupHolds,
  listBackups,
  readBackup,
} from "../../../server/files/backup-store";

const tmp = () => makeTempDir("mt-backup-");
const backupsIn = (dir: string) =>
  readdirSync(dir)
    .filter((n) => n.endsWith(".bak"))
    .sort();

// Resolved, not POSIX literals: on Windows an absolute path is drive-qualified, so an
// expectation written as "/backups" only agrees on the developer's machine.
const ROOT = path.resolve("/backups");
const FILE = path.resolve("/proj/a.md");
// Built by hand rather than with path.join, which would normalize away the `..` this is about.
const MESSY_FILE = [path.dirname(FILE), "sub", "..", path.basename(FILE)].join(path.sep);

describe("backupDirFor", () => {
  it("gives each file its own stable directory", () => {
    expect(backupDirFor(FILE, ROOT)).toBe(backupDirFor(FILE, ROOT));
    expect(backupDirFor(FILE, ROOT)).not.toBe(backupDirFor(path.resolve("/proj/b.md"), ROOT));
    // Same file reached by a messier path is the same file.
    expect(backupDirFor(MESSY_FILE, ROOT)).toBe(backupDirFor(FILE, ROOT));
  });

  // A path can't BE a directory name: separators, case folding and length limits all break it.
  it("names it with a hash, not the path", () => {
    const dir = backupDirFor(FILE, ROOT);
    expect(path.dirname(dir)).toBe(ROOT);
    expect(path.basename(dir)).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe("expiredBackups", () => {
  const names = ["000000000000001-a.md.bak", "000000000000002-a.md.bak", "000000000000003-a.md.bak", "000000000000004-a.md.bak"];

  it("drops the oldest beyond the limit, keeping the newest", () => {
    expect(expiredBackups(names)).toEqual(["000000000000001-a.md.bak"]);
    expect(expiredBackups(names, 2)).toEqual(["000000000000002-a.md.bak", "000000000000001-a.md.bak"]);
  });

  it("keeps everything while under the limit, and never touches non-backups", () => {
    expect(expiredBackups(names.slice(0, BACKUP_GENERATIONS))).toEqual([]);
    expect(expiredBackups([...names, "source.txt"])).not.toContain("source.txt");
  });
});

describe("storeBackup", () => {
  const withStore = (run: (file: string, root: string, dir: string) => void) => {
    const proj = tmp();
    const root = tmp();
    const file = path.join(proj, "a.md");
    try {
      run(file, root, backupDirFor(file, root));
    } finally {
      rmSync(proj, { recursive: true, force: true });
      rmSync(root, { recursive: true, force: true });
    }
  };

  it("keeps only the newest generations, oldest first out", () => {
    withStore((file, root, dir) => {
      ["one", "two", "three", "four"].forEach((text, i) => storeBackup(file, text, root, 1000 + i));
      const kept = backupsIn(dir).map((n) => readFileSync(path.join(dir, n), "utf8"));
      expect(kept).toEqual(["two", "three", "four"]);
    });
  });

  // Re-opening a file calls through here. Rotating identical copies would push the real
  // history out three opens later, which is exactly when it is wanted.
  it("does not rotate a generation when the content is unchanged", () => {
    withStore((file, root, dir) => {
      expect(storeBackup(file, "same", root, 1000)).not.toBeNull();
      expect(storeBackup(file, "same", root, 2000)).toBeNull();
      expect(backupsIn(dir)).toHaveLength(1);

      expect(storeBackup(file, "different", root, 3000)).not.toBeNull();
      expect(backupsIn(dir)).toHaveLength(2);
    });
  });

  // Saving on the user's behalf means bursts. A bare timestamp had the second write of a
  // millisecond replace the first, quietly costing a generation exactly when churn makes them
  // worth having.
  it("keeps both generations written within the same millisecond", () => {
    withStore((file, root, dir) => {
      expect(storeBackup(file, "first", root, 1000)).not.toBeNull();
      expect(storeBackup(file, "second", root, 1000)).not.toBeNull();
      const kept = backupsIn(dir).map((n) => readFileSync(path.join(dir, n), "utf8"));
      expect(kept).toEqual(["first", "second"]); // still in the order they were written
    });
  });

  // The directory is named by a hash, so nothing in it says which file it belongs to.
  it("records the source path so the store can be read by a human", () => {
    withStore((file, root, dir) => {
      storeBackup(file, "one", root, 1000);
      expect(readFileSync(path.join(dir, "source.txt"), "utf8")).toBe(file);
    });
  });

  // Refusing to save because a BACKUP failed would be exactly backwards.
  it("reports failure instead of throwing when the store is unusable", () => {
    const proj = tmp();
    const file = path.join(proj, "a.md");
    const blocked = path.join(proj, "not-a-dir");
    writeFileSync(blocked, "in the way");
    expect(storeBackup(file, "one", blocked)).toBeNull();
    rmSync(proj, { recursive: true, force: true });
  });
});

describe("backupCurrentFile", () => {
  it("banks what is on disk right now", () => {
    const proj = tmp();
    const root = tmp();
    const file = path.join(proj, "a.md");
    writeFileSync(file, "on disk");

    const stored = backupCurrentFile(file, root, 1000);
    expect(stored).not.toBeNull();
    expect(readFileSync(stored as string, "utf8")).toBe("on disk");

    rmSync(proj, { recursive: true, force: true });
    rmSync(root, { recursive: true, force: true });
  });

  it("has nothing to bank for a file that isn't there yet", () => {
    const root = tmp();
    const missing = path.join(tmp(), "nope.md");
    expect(backupCurrentFile(missing, root)).toBeNull();
    expect(existsSync(backupDirFor(missing, root))).toBe(false);
    rmSync(root, { recursive: true, force: true });
  });
});

// #2574. The history reads the store back: which generations a file has, and one of them by id.
describe("backupTakenAt", () => {
  it("reads the time from a name this store wrote", () => {
    expect(backupTakenAt("001727000000000-001-a.md.bak")).toBe(1727000000000);
  });

  it.each(["source.txt", "001727000000000-001-a.md", "abc727000000000-001-a.md.bak", "1727000000000-001-a.md.bak", "../x.bak"])("refuses %j", (name) => {
    expect(backupTakenAt(name)).toBeNull();
  });
});

describe("listBackups and readBackup", () => {
  it("lists a file's generations newest first and reads each back", () => {
    const root = tmp();
    const file = path.join(root, "proj", "a.md");
    try {
      storeBackup(file, "one", root, 1000);
      storeBackup(file, "two", root, 2000);
      const entries = listBackups(file, root);
      expect(entries.map((entry) => entry.at)).toEqual([2000, 1000]);
      expect(entries.map((entry) => readBackup(file, root, entry.id))).toEqual(["two", "one"]);
      expect(entries[0]?.bytes).toBe(3);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("reads nothing it did not list: another file's backup, the source note, a climb", () => {
    const root = tmp();
    const file = path.join(root, "proj", "a.md");
    const other = path.join(root, "proj", "b.md");
    try {
      storeBackup(file, "mine", root, 1000);
      storeBackup(other, "theirs", root, 1000);
      const [theirs] = listBackups(other, root);
      expect(theirs && readBackup(file, root, theirs.id)).toBeNull();
      expect(readBackup(file, root, "source.txt")).toBeNull();
      expect(readBackup(file, root, `../${path.basename(backupDirFor(other, root))}/${theirs?.id ?? ""}`)).toBeNull();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("is empty for a file with no backups", () => {
    const root = tmp();
    try {
      expect(listBackups(path.join(root, "none.md"), root)).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("the store's own checks", () => {
  // The directory name is a truncated hash; source.txt says whose store it is.
  it("lists nothing from a store whose source.txt names another file", () => {
    const root = tmp();
    const file = path.join(root, "proj", "a.md");
    try {
      storeBackup(file, "mine", root, 1000);
      writeFileSync(path.join(backupDirFor(file, root), "source.txt"), path.join(root, "proj", "other.md"));
      expect(listBackups(file, root)).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  // What a client banking text it is about to discard needs: kept (even if skipped as a repeat), or not.
  it("says whether the store holds a text", () => {
    const root = tmp();
    const file = path.join(root, "proj", "a.md");
    try {
      expect(backupHolds(file, "x", root)).toBe(false);
      storeBackup(file, "x", root, 1000);
      expect(backupHolds(file, "x", root)).toBe(true);
      expect(storeBackup(file, "x", root, 2000)).toBeNull(); // skipped as a repeat
      expect(backupHolds(file, "x", root)).toBe(true);
      expect(backupHolds(file, "y", root)).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
