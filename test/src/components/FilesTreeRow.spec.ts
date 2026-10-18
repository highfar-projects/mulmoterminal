import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import FilesTreeRow from "../../../src/components/FilesTreeRow.vue";
import { gitDecorations } from "../../../src/components/filesGitDecorations";
import type { FileGitState } from "../../../common/fileGitStatus";
import type { TreeNode } from "../../../src/composables/useFilesTree";

const node = (path: string, dir = false): TreeNode => ({
  name: path.split("/").pop() ?? path,
  path,
  dir,
  size: 1,
  expanded: false,
  loaded: false,
  children: [],
});
const row = (n: TreeNode, files: Record<string, FileGitState>, active = false) =>
  mount(FilesTreeRow, { props: { node: n, depth: 1, active, git: gitDecorations(files) } });

describe("FilesTreeRow's git mark", () => {
  it.each<[FileGitState, string, string]>([
    ["modified", "M", "text-amber"],
    ["added", "A", "text-ok"],
    ["untracked", "U", "text-ok"],
    ["renamed", "R", "text-ok"],
  ])("a %s file is marked %s in %s, name and mark alike", (state, letter, tone) => {
    const w = row(node("a.ts"), { "a.ts": state });
    const mark = w.find('[role="img"]');
    expect(mark.text()).toBe(letter);
    expect(mark.classes()).toContain(tone);
    expect(w.find("[data-row-name]").classes()).toContain(tone);
  });

  it("gives a folder holding changes a dot, and an unchanged file nothing", () => {
    expect(row(node("src", true), { "src/a.ts": "modified" }).find('[role="img"]').text()).toBe("●");
    expect(row(node("b.ts"), { "src/a.ts": "modified" }).find('[role="img"]').exists()).toBe(false);
  });

  it("says which row is the open file", () => {
    expect(row(node("a.ts"), {}, true).attributes("aria-current")).toBe("true");
    expect(row(node("a.ts"), {}).attributes("aria-current")).toBeUndefined();
  });
});
