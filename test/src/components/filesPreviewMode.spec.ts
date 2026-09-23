import { describe, it, expect } from "vitest";
import { staysOnSameFile, restoresPreview, type RememberedView, type ReopenedFile } from "../../../src/components/filesPreviewMode";

// #2137. The Files pane remembers the file it had open; these two say when it may also come back
// in the Markdown preview it was left in. Both directions matter equally: forgetting the mode is
// the bug being fixed, and keeping one it should not is a preview iframe over a file with no way
// back to the editor.
describe("staysOnSameFile", () => {
  it("says yes when the same file is re-read", () => {
    expect(staysOnSameFile("docs/plan.md", "docs/plan.md")).toBe(true);
  });

  it.each([
    ["another markdown file", "docs/plan.md", "docs/other.md"],
    ["a file that is not markdown", "docs/plan.md", "src/main.ts"],
    ["the first file of the session", null, "docs/plan.md"],
  ])("says no when the pane is opening %s", (_case, openPath, nextPath) => {
    expect(staysOnSameFile(openPath, nextPath)).toBe(false);
  });
});

describe("restoresPreview", () => {
  const remembered: RememberedView = { openPath: "docs/plan.md", showPreview: true };
  const markdown: ReopenedFile = { openPath: "docs/plan.md", isMarkdown: true, unpreviewable: false };

  it("comes back in Preview over the file it was remembered for", () => {
    expect(restoresPreview(remembered, markdown)).toBe(true);
  });

  it.each<[string, RememberedView, ReopenedFile]>([
    ["the pane was left in the editor", { openPath: "docs/plan.md", showPreview: false }, markdown],
    ["nothing was remembered about the mode", { openPath: "docs/plan.md" }, markdown],
    ["nothing was open to remember a mode for", { openPath: null, showPreview: true }, { openPath: null, isMarkdown: false, unpreviewable: false }],
    ["the read did not land", remembered, { openPath: null, isMarkdown: false, unpreviewable: false }],
    ["another request took the pane", remembered, { openPath: "src/main.ts", isMarkdown: false, unpreviewable: false }],
    ["the path is no longer markdown", remembered, { openPath: "docs/plan.md", isMarkdown: false, unpreviewable: false }],
    ["the server will not serve it as text", remembered, { openPath: "docs/plan.md", isMarkdown: true, unpreviewable: true }],
  ])("falls back to the editor when %s", (_case, state, reopened) => {
    expect(restoresPreview(state, reopened)).toBe(false);
  });
});
