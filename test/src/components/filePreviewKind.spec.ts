import { describe, it, expect } from "vitest";
import { fileMediaKind, filePreviewKind, previewFollowsAppTheme } from "../../../src/components/filePreviewKind";

// #2269. What the pane shows a file as, besides its text.
describe("filePreviewKind", () => {
  it.each([
    ["notes.md", "markdown"],
    ["README.MARKDOWN", "markdown"],
    ["report.html", "html"],
    ["page.HTM", "html"],
    ["chart.svg", "svg"],
    ["rows.csv", "table"],
    ["rows.tsv", "table"],
    ["ROWS.CSV", "table"],
  ])("previews %s as %s", (name, kind) => {
    expect(filePreviewKind(name)).toBe(kind);
  });

  it.each([["index.ts"], ["chart.png"], ["data.json"], ["notes.txt"], ["html"], ["rows.csv.bak"], ["csv"], [""]])("gives %j no Preview", (name) => {
    expect(filePreviewKind(name)).toBeNull();
  });
});

// #2269, #2674. What the pane draws from the raw route instead of reading as text.
describe("fileMediaKind", () => {
  it.each([
    ["chart.png", "image"],
    ["photo.JPG", "image"],
    ["a.jpeg", "image"],
    ["anim.gif", "image"],
    ["x.webp", "image"],
    ["paper.pdf", "pdf"],
    ["PAPER.PDF", "pdf"],
    ["clip.mp4", "video"],
    ["clip.webm", "video"],
    ["clip.mov", "video"],
    ["song.mp3", "audio"],
    ["memo.m4a", "audio"],
    ["tone.wav", "audio"],
    ["tone.ogg", "audio"],
  ])("draws %s as %s", (name, kind) => {
    expect(fileMediaKind(name)).toBe(kind);
  });

  // An SVG is text, edited as such and previewed; the rest are read as text first.
  it.each([["chart.svg"], ["index.html"], ["notes.md"], ["archive.zip"], ["book.xlsx"], ["pdf"], ["clip.mp4.bak"], [""]])("does not draw %j", (name) => {
    expect(fileMediaKind(name)).toBeNull();
  });
});

// #2559. The documents the server renders take the app's colours; a page or an SVG is the file's own.
describe("previewFollowsAppTheme", () => {
  it.each([["markdown"], ["table"]] as const)("draws a %s Preview in the app's colours", (kind) => {
    expect(previewFollowsAppTheme(kind)).toBe(true);
  });

  it.each([["html"], ["svg"], [null]] as const)("leaves %j on white", (kind) => {
    expect(previewFollowsAppTheme(kind)).toBe(false);
  });
});
