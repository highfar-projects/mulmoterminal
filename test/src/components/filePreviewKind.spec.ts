import { describe, it, expect } from "vitest";
import { filePreviewKind, isRasterImage } from "../../../src/components/filePreviewKind";

// #2269. What the pane shows a file as, besides its text.
describe("filePreviewKind", () => {
  it.each([
    ["notes.md", "markdown"],
    ["README.MARKDOWN", "markdown"],
    ["report.html", "html"],
    ["page.HTM", "html"],
    ["chart.svg", "svg"],
  ])("previews %s as %s", (name, kind) => {
    expect(filePreviewKind(name)).toBe(kind);
  });

  it.each([["index.ts"], ["chart.png"], ["data.json"], ["notes.txt"], ["html"], [""]])("gives %j no Preview", (name) => {
    expect(filePreviewKind(name)).toBeNull();
  });
});

describe("isRasterImage", () => {
  it.each([["chart.png"], ["photo.JPG"], ["a.jpeg"], ["anim.gif"], ["x.webp"]])("shows %s as a picture", (name) => {
    expect(isRasterImage(name)).toBe(true);
  });

  // An SVG is text, edited as such and previewed; a PDF is not an image.
  it.each([["chart.svg"], ["paper.pdf"], ["index.html"], ["notes.md"], [""]])("does not treat %j as one", (name) => {
    expect(isRasterImage(name)).toBe(false);
  });
});
