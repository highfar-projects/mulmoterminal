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

const filesOf = (answer: unknown) => namedTextFiles(answer, TREE).files;

describe("the documents a person named", () => {
  it("takes a file as it is, and every text file under a folder, however deep", () => {
    expect(filesOf("README.md")).toEqual(["README.md"]);
    expect(filesOf("docs")).toEqual(["docs/a.md", "docs/b.markdown", "docs/sub/d.md"]);
  });

  it("reads the whole folder for '.', leaving out the build's own folder and the tools'", () => {
    expect(filesOf(".")).toEqual(["README.md", "docs/a.md", "docs/b.markdown", "docs/sub/d.md", "notes.txt"]);
  });

  it("takes each line once, in a stable order, whatever the spacing, trailing slashes, './' and repeats", () => {
    expect(filesOf("  docs/  \n\nREADME.md\n./docs/a.md\nREADME.md")).toEqual(["README.md", "docs/a.md", "docs/b.markdown", "docs/sub/d.md"]);
  });

  it("reads a line written with Windows separators as the same path", () => {
    expect(filesOf("docs\\sub")).toEqual(["docs/sub/d.md"]);
    expect(filesOf("docs\\a.md")).toEqual(["docs/a.md"]);
  });

  it.each<[string, unknown]>([
    ["a path that is not there", "missing.md"],
    ["a file that is not text", "logo.png"],
    ["nothing", ""],
    ["no answer at all", undefined],
    ["a folder with no text in it", "docs/sub/none"],
  ])("finds none, and refuses nothing, for %s", (_label, answer) => {
    expect(namedTextFiles(answer, TREE)).toEqual({ files: [], refused: [] });
  });

  it.each(["../other/a.md", "..", "docs/../../x.md", "/etc/passwd", "C:\\Users\\a.md", "c:/a.md"])(
    "refuses the line %j, which leaves this folder, rather than reading it",
    (line) => {
      expect(namedTextFiles(`README.md\n${line}`, TREE)).toEqual({ files: ["README.md"], refused: [line] });
    },
  );

  it("reports a symbolic link instead of following it, named directly or met in a folder", () => {
    const linked = folderOf({ ".": ["docs"], docs: ["a.md", "loop", "out.md"], "docs/a.md": null, "docs/loop": null, "docs/out.md": null });
    const reader: FolderReader = { ...linked, kindOf: (path) => (path === "docs/loop" || path === "docs/out.md" ? "link" : linked.kindOf(path)) };
    expect(namedTextFiles("docs", reader)).toEqual({ files: ["docs/a.md"], refused: ["docs/loop", "docs/out.md"] });
    expect(namedTextFiles("docs/out.md", reader)).toEqual({ files: [], refused: ["docs/out.md"] });
  });
});
