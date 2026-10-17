import { describe, it, expect } from "vitest";
import { galleryAfterTreeOp, galleryItems, galleryKind, steppedIndex } from "../../../src/components/filesGallery";

const file = (name: string, dir = false) => ({ name, dir, size: 1 });

describe("galleryKind", () => {
  it.each([
    ["a.png", "image"],
    ["a.JPG", "image"],
    ["a.gif", "image"],
    ["a.webp", "image"],
    ["a.svg", "image"], // a picture in an <img>, where it runs nothing
    ["a.mp4", "video"],
    ["a.webm", "video"],
    ["a.mp3", "audio"],
    ["a.pdf", "pdf"],
  ])("%s is drawn as %s", (name, kind) => {
    expect(galleryKind(name)).toBe(kind);
  });

  it.each(["a.md", "a.ts", "README", "a.csv", "a.html", ".png"])("%s is not drawn", (name) => {
    expect(galleryKind(name)).toBeNull();
  });
});

describe("galleryItems", () => {
  it("keeps the folder's own media files, in name order with numbers counted as numbers", () => {
    const entries = [file("10.png"), file("notes.md"), file("2.png"), file("sub", true), file("clip.mp4"), file("B.pdf"), file("a.mp3")];
    expect(galleryItems(entries, "shots").map((item) => [item.pathRel, item.kind])).toEqual([
      ["shots/2.png", "image"],
      ["shots/10.png", "image"],
      ["shots/a.mp3", "audio"],
      ["shots/B.pdf", "pdf"],
      ["shots/clip.mp4", "video"],
    ]);
  });

  it("does not look into a folder, even one named like a picture", () => {
    expect(galleryItems([file("frames.png", true)], "x")).toEqual([]);
  });

  it("joins nothing in front at the root", () => {
    expect(galleryItems([file("a.png")], "")).toEqual([{ pathRel: "a.png", name: "a.png", kind: "image" }]);
  });
});

describe("steppedIndex", () => {
  it("moves one either way and goes round at the ends", () => {
    expect(steppedIndex(0, 1, 3)).toBe(1);
    expect(steppedIndex(2, 1, 3)).toBe(0);
    expect(steppedIndex(0, -1, 3)).toBe(2);
    expect(steppedIndex(0, 1, 1)).toBe(0);
  });

  it("answers 0 for an empty folder rather than NaN", () => {
    expect(steppedIndex(0, 1, 0)).toBe(0);
    expect(steppedIndex(0, -1, 0)).toBe(0);
  });
});

describe("galleryAfterTreeOp", () => {
  it("rechecks a rename or Trash of the folder, or of a folder above it", () => {
    ["rename", "trash"].forEach((id) => {
      expect(galleryAfterTreeOp("a/shots", { id: id === "rename" ? "rename" : "trash", pathRel: "a/shots" })).toBe("recheck");
      expect(galleryAfterTreeOp("a/shots", { id: id === "rename" ? "rename" : "trash", pathRel: "a" })).toBe("recheck");
    });
  });

  it("reads the folder again when one of its own files changes", () => {
    expect(galleryAfterTreeOp("a/shots", { id: "trash", pathRel: "a/shots/x.png" })).toBe("refresh");
    expect(galleryAfterTreeOp("a/shots", { id: "rename", pathRel: "a/shots/x.png" })).toBe("refresh");
    expect(galleryAfterTreeOp("a/shots", { id: "new-file", dirRel: "a/shots" })).toBe("refresh");
    expect(galleryAfterTreeOp("a/shots", { id: "new-folder", dirRel: "a/shots" })).toBe("refresh");
  });

  it("leaves it be for anything elsewhere, including a sibling sharing a prefix and a file deeper down", () => {
    expect(galleryAfterTreeOp("a/shots", { id: "rename", pathRel: "a/shots2" })).toBe("keep");
    expect(galleryAfterTreeOp("a/shots", { id: "trash", pathRel: "a/shots/sub/x.png" })).toBe("keep");
    expect(galleryAfterTreeOp("a/shots", { id: "new-file", dirRel: "a" })).toBe("keep");
    expect(galleryAfterTreeOp("a/shots", { id: "trash", pathRel: "b/x.png" })).toBe("keep");
  });

  it("treats the root gallery's own files as its own", () => {
    expect(galleryAfterTreeOp("", { id: "trash", pathRel: "x.png" })).toBe("refresh");
    expect(galleryAfterTreeOp("", { id: "new-file", dirRel: "" })).toBe("refresh");
  });
});
