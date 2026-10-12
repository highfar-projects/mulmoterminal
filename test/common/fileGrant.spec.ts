import { describe, it, expect } from "vitest";
import { grantKind } from "../../common/fileGrant";

describe("grantKind", () => {
  it.each([
    ["page.html", "page"],
    ["PAGE.HTM", "page"],
    ["clip.mp4", "raw"],
    ["a.PNG", "raw"],
    ["d.svg", "raw"],
    ["r.pdf", "raw"],
    ["s.mp3", "raw"],
  ])("grants %s as %s", (name, kind) => {
    expect(grantKind(name)).toBe(kind);
  });

  it.each(["notes.md", "data.json", "t.csv", "a.ts", "noext", "x.zip", "page.html.txt"])("does not grant %s", (name) => {
    expect(grantKind(name)).toBeNull();
  });
});
