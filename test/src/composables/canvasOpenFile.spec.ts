// Which files the Canvas can be asked to open, and what card is written for them (#1374).
//
// The gates are the PLUGINS' own (`isDocumentPath`, `isPresentableHtmlPath`), so what is pinned
// here is that this module actually defers to them rather than re-deciding with a weaker extension
// test — the traversal and dotfile cases below are the ones a hand-rolled `.endsWith(".md")` would
// wave through.
import { describe, it, expect } from "vitest";

import { canvasCardForFile, canOpenInCanvas, absoluteUnder } from "../../../src/composables/canvasOpenFile";

describe("canvasCardForFile", () => {
  it("renders a markdown document through presentDocument, keyed by its path", () => {
    expect(canvasCardForFile("docs/design.md")).toEqual({
      toolName: "presentDocument",
      // `markdown: ""` is required by MarkdownToolData; `docPath` is what documentPathOf reads.
      data: { markdown: "", docPath: "docs/design.md" },
    });
  });

  it("takes a markdown file from anywhere in the workspace, not only the artifacts area", () => {
    expect(canvasCardForFile("README.md")?.toolName).toBe("presentDocument");
  });

  // Inside artifacts the View could derive this URL itself; it is set anyway so the card does not
  // depend on a fallback that only holds for one of the two locations.
  it("points an artifacts page at the artifacts mount", () => {
    expect(canvasCardForFile("artifacts/html/page.html")).toEqual({
      toolName: "presentHtml",
      data: { filePath: "artifacts/html/page.html", previewUrl: "/artifacts/html/page.html" },
    });
  });

  // The case the View's fallback gets WRONG. The Files pane is rooted at the cell's cwd, so most
  // html a user opens is outside artifacts; deriving `/artifacts/html/…` for it would point the
  // iframe at nothing.
  it("points a page outside artifacts at the /htmlfile mount instead", () => {
    expect(canvasCardForFile("site/index.html")).toEqual({
      toolName: "presentHtml",
      data: { filePath: "site/index.html", previewUrl: "/htmlfile/ws/site/index.html" },
    });
  });

  it("has nothing to show for a file neither plugin renders", () => {
    expect(canvasCardForFile("notes.txt")).toBeNull();
    expect(canvasCardForFile("src/main.ts")).toBeNull();
  });

  // Both of these END in a renderable extension, so an extension test would accept them. The
  // plugins refuse them — a prefixed traversal, and a dotfile segment the iframe mount denies.
  it("refuses a path the plugin's own guard refuses", () => {
    expect(canvasCardForFile("artifacts/documents/../../secrets.md")).toBeNull();
    expect(canvasCardForFile(".hidden/x.html")).toBeNull();
  });
});

describe("canOpenInCanvas", () => {
  it("answers for the button's sake, and says no when nothing is open", () => {
    expect(canOpenInCanvas("docs/design.md")).toBe(true);
    expect(canOpenInCanvas("site/index.html")).toBe(true);
    expect(canOpenInCanvas("notes.txt")).toBe(false);
    expect(canOpenInCanvas(null)).toBe(false);
  });
});

// The bug the browser found: the Files pane is rooted at the CELL's directory while the plugins
// resolve against the WORKSPACE, so a bare `design.md` from a project cell named a workspace file
// that does not exist — the card was written, the pane opened, and nothing rendered.
describe("absoluteUnder", () => {
  it("puts the pane's relative row under the cell's directory", () => {
    expect(absoluteUnder("/work/proj", "docs/design.md")).toBe("/work/proj/docs/design.md");
  });

  it("does not double the separator", () => {
    expect(absoluteUnder("/work/proj/", "design.md")).toBe("/work/proj/design.md");
  });

  // Joined with `/` on every platform. Both plugin gates accept the mixed result and htmlFileUrl
  // normalises it, so there is no separator arithmetic to get wrong per-OS.
  it("leaves a Windows directory alone and still produces a path the gates accept", () => {
    const joined = absoluteUnder("C:\\Users\\me\\proj", "docs/design.md");
    expect(joined).toBe("C:\\Users\\me\\proj/docs/design.md");
    expect(canvasCardForFile(joined)?.toolName).toBe("presentDocument");
  });

  it("passes the path through when there is no cwd to anchor it to", () => {
    expect(absoluteUnder(null, "design.md")).toBe("design.md");
  });
});
