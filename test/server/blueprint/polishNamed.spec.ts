// @vitest-environment node
// The documents a person named for polishing: what the survey's empty list is checked against, so a file it misses
// is one an agent could leave out unchecked.
import { describe, expect, it } from "vitest";
import { namedTextFiles, type FolderReader } from "../../../blueprints/polish/checks/named.mjs";

// A folder as a map from path to its entries (a folder) or null (a file).
const folderOf = (tree: Record<string, string[] | null>): FolderReader => ({
  kindOf: (path) => {
    if (!(path in tree)) return null;
    return tree[path] === null ? "file" : "dir";
  },
  entries: (dir) => tree[dir] ?? [],
});

const TREE = folderOf({
  ".": ["README.md", "docs", "notes.txt", "logo.png", ".blueprint", ".git", "node_modules"],
  "README.md": null,
  "notes.txt": null,
  "logo.png": null,
  docs: ["a.md", "b.markdown", "sub", "c.pdf"],
  "docs/a.md": null,
  "docs/b.markdown": null,
  "docs/c.pdf": null,
  "docs/sub": ["d.md"],
  "docs/sub/d.md": null,
  ".blueprint": ["answers.md"],
  ".blueprint/answers.md": null,
  ".git": ["x.md"],
  ".git/x.md": null,
  node_modules: ["y.md"],
  "node_modules/y.md": null,
});

describe("the documents a person named", () => {
  it("takes a file as it is, and every text file under a folder, however deep", () => {
    expect(namedTextFiles("README.md", TREE)).toEqual(["README.md"]);
    expect(namedTextFiles("docs", TREE)).toEqual(["docs/a.md", "docs/b.markdown", "docs/sub/d.md"]);
  });

  it("reads the whole folder for '.', leaving out the build's own folder and the tools'", () => {
    expect(namedTextFiles(".", TREE)).toEqual(["README.md", "docs/a.md", "docs/b.markdown", "docs/sub/d.md", "notes.txt"]);
  });

  it("takes each line once, in a stable order, whatever the spacing, trailing slashes and repeats", () => {
    expect(namedTextFiles("  docs/  \n\nREADME.md\ndocs/a.md\nREADME.md", TREE)).toEqual(["README.md", "docs/a.md", "docs/b.markdown", "docs/sub/d.md"]);
  });

  it.each<[string, unknown]>([
    ["a path that is not there", "missing.md"],
    ["a file that is not text", "logo.png"],
    ["nothing", ""],
    ["no answer at all", undefined],
    ["a folder with no text in it", "docs/sub/none"],
  ])("finds none for %s", (_label, answer) => {
    expect(namedTextFiles(answer, TREE)).toEqual([]);
  });
});
