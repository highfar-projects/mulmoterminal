import { describe, it, expect } from "vitest";
import { seedFilesPanel, takeFilesPanelSeed } from "../../../src/composables/filesPanelSeed";

describe("filesPanelSeed", () => {
  it("hands a panel its text once, so the next manual open starts empty", () => {
    seedFilesPanel("files-find", "app.ts");
    expect(takeFilesPanelSeed("files-find")).toBe("app.ts");
    expect(takeFilesPanelSeed("files-find")).toBe("");
  });

  it("keeps the finder's and the search's text apart", () => {
    seedFilesPanel("files-search", "TODO");
    expect(takeFilesPanelSeed("files-find")).toBe("");
    expect(takeFilesPanelSeed("files-search")).toBe("TODO");
  });
});
