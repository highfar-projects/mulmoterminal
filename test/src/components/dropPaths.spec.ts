import { describe, it, expect } from "vitest";
import { parseFileUris, toShellArg, toInsertText, dropTextFromUriList, dragCarriesFiles, dropPlan } from "../../../src/components/dropPaths.js";

describe("parseFileUris", () => {
  it("parses a single file:// URI into an absolute path", () => {
    expect(parseFileUris("file:///Users/me/a.txt")).toEqual(["/Users/me/a.txt"]);
  });

  it("parses multiple newline-separated URIs", () => {
    expect(parseFileUris("file:///a/b.txt\nfile:///c/d.txt")).toEqual(["/a/b.txt", "/c/d.txt"]);
  });

  it("decodes percent-encoded characters (spaces, unicode)", () => {
    expect(parseFileUris("file:///Users/me/My%20File.txt")).toEqual(["/Users/me/My File.txt"]);
    expect(parseFileUris("file:///Users/me/%E6%97%A5%E6%9C%AC.md")).toEqual(["/Users/me/日本.md"]);
  });

  it("ignores comment lines and blanks (uri-list format)", () => {
    expect(parseFileUris("# comment\n\nfile:///a.txt\n")).toEqual(["/a.txt"]);
  });

  it("skips non-file:// lines (http, bare text)", () => {
    expect(parseFileUris("https://example.com\njust text\nfile:///a.txt")).toEqual(["/a.txt"]);
  });

  it("strips the leading slash from a Windows drive path", () => {
    expect(parseFileUris("file:///C:/Users/me/a.txt")).toEqual(["C:/Users/me/a.txt"]);
  });

  it("preserves the host for a UNC share (does not drop the authority)", () => {
    expect(parseFileUris("file://server/share/a.txt")).toEqual(["\\\\server\\share\\a.txt"]);
  });

  it("treats a localhost authority as a local path", () => {
    expect(parseFileUris("file://localhost/Users/me/a.txt")).toEqual(["/Users/me/a.txt"]);
  });

  it("returns empty for empty or path-less input", () => {
    expect(parseFileUris("")).toEqual([]);
    expect(parseFileUris("# only a comment")).toEqual([]);
  });
});

describe("toShellArg", () => {
  it("leaves a bare safe path unquoted", () => {
    expect(toShellArg("/Users/me/a.txt")).toBe("/Users/me/a.txt");
  });

  it("single-quotes paths with spaces or shell-special chars", () => {
    expect(toShellArg("/Users/me/My File.txt")).toBe("'/Users/me/My File.txt'");
    expect(toShellArg("/Users/me/a;rm -rf b")).toBe("'/Users/me/a;rm -rf b'");
  });

  it("escapes embedded single quotes", () => {
    expect(toShellArg("/Users/me/it's.txt")).toBe("'/Users/me/it'\\''s.txt'");
  });
});

describe("toInsertText", () => {
  it("joins quoted paths with spaces", () => {
    expect(toInsertText(["/a.txt", "/My Dir/b.txt"])).toBe("/a.txt '/My Dir/b.txt' ");
  });
  // Two gestures in a row insert at the cursor the previous one left behind, so the separator
  // has to be part of the insertion: pasting two screenshots (#938) otherwise reads as one name.
  it("ends in a space, so a second insertion does not run into the first", () => {
    expect(toInsertText(["/a.png"]) + toInsertText(["/b.png"])).toBe("/a.png /b.png ");
  });
  it("returns empty string for no paths", () => {
    expect(toInsertText([])).toBe("");
  });
});

describe("dropTextFromUriList", () => {
  it("joins quoted paths with spaces", () => {
    expect(dropTextFromUriList("file:///a.txt\nfile:///My%20Dir/b.txt")).toBe("/a.txt '/My Dir/b.txt' ");
  });

  it("returns empty string when no file path is present", () => {
    expect(dropTextFromUriList("")).toBe("");
    expect(dropTextFromUriList("https://example.com")).toBe("");
  });
});

describe("dragCarriesFiles", () => {
  it("is true when the type list includes the Files sentinel", () => {
    expect(dragCarriesFiles(["Files"])).toBe(true);
    expect(dragCarriesFiles(["text/plain", "text/uri-list", "Files"])).toBe(true);
  });

  it("is false for an in-app / text-only drag and an empty list", () => {
    expect(dragCarriesFiles(["text/plain"])).toBe(false);
    expect(dragCarriesFiles(["application/x-cell-reorder"])).toBe(false);
    expect(dragCarriesFiles([])).toBe(false);
  });
});

// #2669. With the server on another machine, a path from this browser's machine names nothing, so
// the bytes go up whenever there are any. With the setting off the plan is the one onDrop always
// followed — compared against that logic, kept here as the reference, over every input shape.
describe("dropPlan", () => {
  // onDrop before #2669: a path wins, then files, then the hint.
  const before = (pathText: string, fileCount: number): string => {
    if (pathText) return "insert-path";
    if (fileCount > 0) return "upload";
    return "hint";
  };
  const shapes = ["", "/Users/me/a.png", "'/tmp/b c.txt' /tmp/d"].flatMap((pathText) => [0, 1, 3].map((fileCount) => ({ pathText, fileCount })));

  it("is exactly the old rule when the server is local", () => {
    shapes.forEach(({ pathText, fileCount }) =>
      expect(dropPlan({ pathText, fileCount, remoteServer: false }), `${pathText}/${fileCount}`).toBe(before(pathText, fileCount)),
    );
  });

  it("uploads whenever there are files when the server is remote, even with a path", () => {
    expect(dropPlan({ pathText: "/Users/me/a.png", fileCount: 1, remoteServer: true })).toBe("upload");
    expect(dropPlan({ pathText: "", fileCount: 2, remoteServer: true })).toBe("upload");
  });

  it("still inserts a path with no files behind it, and hints with neither, when remote", () => {
    expect(dropPlan({ pathText: "/tmp/x", fileCount: 0, remoteServer: true })).toBe("insert-path");
    expect(dropPlan({ pathText: "", fileCount: 0, remoteServer: true })).toBe("hint");
  });
});
