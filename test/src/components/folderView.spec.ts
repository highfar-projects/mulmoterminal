// #3120: which folders the empty file area reads, and what it draws of them.
import { describe, it, expect } from "vitest";
import {
  FOLDER_VIEW_MAX_DEPTH,
  compareDirRel,
  folderAfterTreeOp,
  folderGalleryItems,
  folderTitle,
  formatSize,
  groupHeading,
  isDescended,
  listRows,
  orderedGroups,
  parentOf,
  parseFolderViewMode,
  subfoldersToRead,
  withGroupHeadings,
  type FolderGroup,
} from "../../../src/components/folderView";
import type { ListingEntry } from "../../../src/components/filesTreeCache";
import type { GalleryItem } from "../../../src/components/filesGallery";

const dir = (name: string): ListingEntry => ({ name, dir: true, size: 0 });
const file = (name: string, size = 1): ListingEntry => ({ name, dir: false, size });
const group = (dirRel: string, entries: ListingEntry[]): FolderGroup => ({ dirRel, entries });

describe("subfoldersToRead", () => {
  const shots = group("shots", [dir("b"), file("x.png"), dir("a10"), dir("a2"), dir(".git"), dir("node_modules"), dir(".cache")]);

  it("reads the visible subfolders in name order, numbers counted as numbers", () => {
    expect(subfoldersToRead(shots, 0, 10)).toEqual(["shots/a2", "shots/a10", "shots/b"]);
  });

  it("joins at the root without a leading slash", () => {
    expect(subfoldersToRead(group("", [dir("a")]), 0, 10)).toEqual(["a"]);
  });

  it("stops at the depth limit", () => {
    expect(subfoldersToRead(shots, FOLDER_VIEW_MAX_DEPTH - 1, 10)).toHaveLength(3);
    expect(subfoldersToRead(shots, FOLDER_VIEW_MAX_DEPTH, 10)).toEqual([]);
    expect(subfoldersToRead(shots, FOLDER_VIEW_MAX_DEPTH + 5, 10)).toEqual([]);
  });

  it("takes no more than the cap has room for", () => {
    expect(subfoldersToRead(shots, 0, 2)).toEqual(["shots/a2", "shots/a10"]);
    expect(subfoldersToRead(shots, 0, 0)).toEqual([]);
    expect(subfoldersToRead(shots, 0, -3)).toEqual([]);
  });

  it("reads nothing from a folder with no subfolders, or none at all", () => {
    expect(subfoldersToRead(group("x", [file("a.png")]), 0, 10)).toEqual([]);
    expect(subfoldersToRead(group("x", []), 0, 10)).toEqual([]);
  });
});

describe("isDescended", () => {
  it("skips dot-folders and node_modules, nothing else", () => {
    expect([".git", ".x", "node_modules"].map(isDescended)).toEqual([false, false, false]);
    expect(["src", "node_modules2", "a.b", "_x"].map(isDescended)).toEqual([true, true, true, true]);
  });
});

describe("compareDirRel / orderedGroups", () => {
  it("orders as a tree reads, the shown folder first", () => {
    const paths = ["a10", "a/c", "", "a", "a/b", "a2", "a/b/z"];
    expect([...paths].sort(compareDirRel)).toEqual(["", "a", "a/b", "a/b/z", "a/c", "a2", "a10"]);
  });

  it("is zero for the same path", () => {
    expect(compareDirRel("a/b", "a/b")).toBe(0);
    expect(compareDirRel("", "")).toBe(0);
  });

  it("sorts groups by their path without changing them", () => {
    const groups = [group("s/b", []), group("s", [file("x")]), group("s/a", [])];
    expect(orderedGroups(groups).map((g) => g.dirRel)).toEqual(["s", "s/a", "s/b"]);
    expect(groups.map((g) => g.dirRel)).toEqual(["s/b", "s", "s/a"]);
  });
});

describe("groupHeading", () => {
  it("is null for the shown folder and the path below it otherwise", () => {
    expect(groupHeading("shots", "shots")).toBeNull();
    expect(groupHeading("shots", "shots/a/b")).toBe("a/b");
    expect(groupHeading("", "")).toBeNull();
    expect(groupHeading("", "a/b")).toBe("a/b");
  });
});

describe("listRows", () => {
  it("puts folders first, then files, each in name order", () => {
    const rows = listRows([file("b10.txt"), dir("z"), file("b2.txt"), dir("A")]);
    expect(rows.map((row) => row.name)).toEqual(["A", "z", "b2.txt", "b10.txt"]);
  });

  it("does not change the listing it was given", () => {
    const entries = [file("b"), dir("a")];
    listRows(entries);
    expect(entries.map((e) => e.name)).toEqual(["b", "a"]);
    expect(listRows([])).toEqual([]);
  });
});

describe("folderGalleryItems / withGroupHeadings", () => {
  const groups = [
    group("s", [file("2.png"), file("note.txt"), dir("a")]),
    group("s/a", [file("v.mp4")]),
    group("s/b", [file("readme")]),
    group("s/c", [file("1.png")]),
  ];

  it("draws only the media of every group, in group order", () => {
    expect(folderGalleryItems(groups).map((item) => item.pathRel)).toEqual(["s/2.png", "s/a/v.mp4", "s/c/1.png"]);
    expect(folderGalleryItems([])).toEqual([]);
  });

  it("heads each subfolder's run, not the shown folder's, and keeps the whole-list index", () => {
    const headed = withGroupHeadings(folderGalleryItems(groups), "s");
    expect(headed.map((h) => [h.index, h.heading])).toEqual([
      [0, null],
      [1, "a"],
      [2, "c"],
    ]);
  });

  it("heads only the first item of a run", () => {
    const items: GalleryItem[] = ["a/1.png", "a/2.png", "b/1.png"].map((pathRel) => ({ pathRel, name: pathRel, kind: "image" }));
    expect(withGroupHeadings(items, "").map((h) => h.heading)).toEqual(["a", null, "b"]);
    expect(withGroupHeadings([], "")).toEqual([]);
  });
});

describe("folderAfterTreeOp", () => {
  it("reads again for a change anywhere inside the folder", () => {
    expect(folderAfterTreeOp("s", { id: "new-file", dirRel: "s" })).toBe("refresh");
    expect(folderAfterTreeOp("s", { id: "new-folder", dirRel: "s/a/b" })).toBe("refresh");
    expect(folderAfterTreeOp("s", { id: "rename", pathRel: "s/x.png" })).toBe("refresh");
    expect(folderAfterTreeOp("s", { id: "trash", pathRel: "s/a/x.png" })).toBe("refresh");
    expect(folderAfterTreeOp("", { id: "trash", pathRel: "x.png" })).toBe("refresh");
    expect(folderAfterTreeOp("", { id: "new-file", dirRel: "deep/er" })).toBe("refresh");
  });

  it("rechecks when the folder or one above it is renamed or trashed", () => {
    expect(folderAfterTreeOp("s/a", { id: "rename", pathRel: "s/a" })).toBe("recheck");
    expect(folderAfterTreeOp("s/a", { id: "trash", pathRel: "s" })).toBe("recheck");
  });

  it("leaves it be for a change elsewhere, a sibling with a shared prefix included", () => {
    expect(folderAfterTreeOp("s", { id: "new-file", dirRel: "t" })).toBe("keep");
    expect(folderAfterTreeOp("s", { id: "new-file", dirRel: "s2" })).toBe("keep");
    expect(folderAfterTreeOp("s", { id: "rename", pathRel: "s2/x" })).toBe("keep");
    expect(folderAfterTreeOp("s/a", { id: "trash", pathRel: "s/b" })).toBe("keep");
  });
});

describe("parentOf / folderTitle", () => {
  it("finds the parent, the root for a top-level path", () => {
    expect(parentOf("a/b/c")).toBe("a/b");
    expect(parentOf("a")).toBe("");
    expect(parentOf("")).toBe("");
  });

  it("names the folder, or the root by its own name", () => {
    expect(folderTitle("/proj", "a/b")).toBe("b");
    expect(folderTitle("/home/me/proj/", "")).toBe("proj");
    expect(folderTitle("C:\\work\\proj", "")).toBe("proj");
    expect(folderTitle(null, "")).toBe(".");
    expect(folderTitle("/", "")).toBe(".");
  });
});

describe("parseFolderViewMode", () => {
  it("reads gallery back, and anything else as the list", () => {
    expect(parseFolderViewMode("gallery")).toBe("gallery");
    expect(parseFolderViewMode("list")).toBe("list");
    expect(parseFolderViewMode(null)).toBe("list");
    expect(parseFolderViewMode("")).toBe("list");
    expect(parseFolderViewMode("GALLERY")).toBe("list");
  });
});

describe("formatSize", () => {
  it("shows bytes, then one decimal below ten of a unit, none above", () => {
    expect(formatSize(0)).toBe("0 B");
    expect(formatSize(1023)).toBe("1023 B");
    expect(formatSize(1024)).toBe("1.0 KB");
    expect(formatSize(1536)).toBe("1.5 KB");
    expect(formatSize(10 * 1024)).toBe("10 KB");
    expect(formatSize(5 * 1024 ** 3)).toBe("5.0 GB");
    expect(formatSize(3 * 1024 ** 5)).toBe("3072 TB");
  });

  it("shows something that is not a byte count as 0 B", () => {
    expect(formatSize(-5)).toBe("0 B");
    expect(formatSize(Number.NaN)).toBe("0 B");
    expect(formatSize(Number.POSITIVE_INFINITY)).toBe("0 B");
    expect(formatSize(12.7)).toBe("12 B");
  });
});
