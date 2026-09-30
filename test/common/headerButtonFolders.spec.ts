// #2622. Folders are made by putting a button into one, and go when their last button comes out.
import { describe, it, expect } from "vitest";
import {
  entriesIntoFolder,
  entriesOutOfFolder,
  entriesWithEditedAnywhere,
  entriesWithFolderEdited,
  entriesWithoutAnywhere,
  type ButtonShape,
  type EntryShape,
  type FolderShape,
} from "../../common/headerButtonFolders";
import { MAX_HEADER_BUTTONS, type ButtonDraft } from "../../common/headerButtonEntries";

const button = (id: string): ButtonShape => ({ id, label: id.toUpperCase(), run: "shell", cmd: `run ${id}` });
const folder = (id: string, items: ButtonShape[]): FolderShape => ({ id, label: id.toUpperCase(), items });
const ids = (result: { entries: readonly EntryShape[] } | { problem: string }) =>
  "entries" in result
    ? result.entries.map((entry) => ("items" in entry ? `${entry.id}[${entry.items.map((c) => c.id).join(",")}]` : entry.id))
    : result.problem;
const draft = (fields: Partial<ButtonDraft>): ButtonDraft => ({
  label: "Lint",
  icon: "",
  run: "shell",
  payload: "yarn lint",
  target: "url",
  when: "",
  ...fields,
});

describe("entriesIntoFolder", () => {
  it("makes a new folder where the button was, with a free id", () => {
    const result = entriesIntoFolder([button("a"), button("b"), button("c")], [], "b", { label: " Tools ", icon: "build" });
    expect(ids(result)).toEqual(["a", "tools[b]", "c"]);
    expect("entries" in result && result.entries[1]).toEqual({ id: "tools", label: "Tools", icon: "build", items: [button("b")] });
    expect(ids(entriesIntoFolder([button("tools"), button("b")], [], "b", { label: "Tools", icon: "" }))).toEqual(["tools", "tools-2[b]"]);
  });

  it("puts a button at the end of an existing folder", () => {
    expect(ids(entriesIntoFolder([folder("f", [button("x")]), button("b")], [], "b", { folderId: "f" }))).toEqual(["f[x,b]"]);
  });

  it("starts from the built-in set when unconfigured", () => {
    expect(ids(entriesIntoFolder(null, [button("pr")], "pr", { label: "More", icon: "" }))).toEqual(["more[pr]"]);
  });

  it("refuses a missing button, a folder, a missing destination, a bad name or icon, and a full folder", () => {
    const entries = [folder("f", [button("x")]), button("b")];
    expect(entriesIntoFolder(entries, [], "gone", { folderId: "f" })).toEqual({ problem: "missing" });
    expect(entriesIntoFolder(entries, [], "f", { folderId: "f" })).toEqual({ problem: "folder" });
    expect(entriesIntoFolder(entries, [], "b", { folderId: "nope" })).toEqual({ problem: "missing" });
    expect(entriesIntoFolder(entries, [], "b", { label: " ", icon: "" })).toEqual({ problem: "label" });
    expect(entriesIntoFolder(entries, [], "b", { label: "T", icon: "Bad Icon" })).toEqual({ problem: "icon" });
    const full = folder(
      "f",
      Array.from({ length: MAX_HEADER_BUTTONS }, (_, i) => button(`c${i}`)),
    );
    expect(entriesIntoFolder([full, button("b")], [], "b", { folderId: "f" })).toEqual({ problem: "full" });
  });
});

describe("entriesOutOfFolder", () => {
  it("places the button right after its folder", () => {
    expect(ids(entriesOutOfFolder([folder("f", [button("x"), button("y")]), button("b")], [], "x"))).toEqual(["f[y]", "x", "b"]);
  });

  it("puts the last button in the folder's place, and the folder goes", () => {
    expect(ids(entriesOutOfFolder([button("a"), folder("f", [button("x")]), button("b")], [], "x"))).toEqual(["a", "x", "b"]);
  });

  it("refuses a button that is not in a folder, and a full top level", () => {
    expect(entriesOutOfFolder([button("a")], [], "a")).toEqual({ problem: "missing" });
    const many = Array.from({ length: MAX_HEADER_BUTTONS - 1 }, (_, i) => button(`t${i}`));
    expect(entriesOutOfFolder([...many, folder("f", [button("x"), button("y")])], [], "x")).toEqual({ problem: "full" });
  });
});

describe("entriesWithoutAnywhere / entriesWithEditedAnywhere", () => {
  it("removes a button inside a folder, and the folder with its last one", () => {
    expect(ids(entriesWithoutAnywhere([folder("f", [button("x"), button("y")])], [], "y"))).toEqual(["f[x]"]);
    expect(ids(entriesWithoutAnywhere([folder("f", [button("x")]), button("b")], [], "x"))).toEqual(["b"]);
    expect(ids(entriesWithoutAnywhere([button("a"), button("b")], [], "a"))).toEqual(["b"]);
    expect(entriesWithoutAnywhere([button("a")], [], "gone")).toEqual({ problem: "missing" });
  });

  it("edits a button inside a folder in place, keeping its id and order", () => {
    const result = entriesWithEditedAnywhere([folder("f", [{ ...button("x"), order: 3 }])], [], "x", draft({}));
    expect("entries" in result && result.entries[0]).toEqual({
      id: "f",
      label: "F",
      items: [{ id: "x", label: "Lint", run: "shell", cmd: "yarn lint", order: 3 }],
    });
    expect(ids(entriesWithEditedAnywhere([button("a")], [], "a", draft({})))).toEqual(["a"]);
    expect(entriesWithEditedAnywhere([folder("f", [button("x")])], [], "x", draft({ payload: "" }))).toEqual({ problem: "payload" });
  });
});

describe("entriesWithFolderEdited", () => {
  it("changes a folder's name, icon and condition, keeping its buttons, id and order", () => {
    const f = { ...folder("f", [button("x")]), icon: "old", when: "isGitRepo", order: 2 };
    const result = entriesWithFolderEdited([f], [], "f", { label: " More ", icon: "", when: "" });
    expect("entries" in result && result.entries[0]).toEqual({ id: "f", label: "More", items: [button("x")], order: 2 });
  });

  it("refuses a button, a missing id, and a bad name or icon", () => {
    expect(entriesWithFolderEdited([button("a")], [], "a", { label: "x", icon: "", when: "" })).toEqual({ problem: "missing" });
    expect(entriesWithFolderEdited([folder("f", [button("x")])], [], "f", { label: "", icon: "", when: "" })).toEqual({ problem: "label" });
    expect(entriesWithFolderEdited([folder("f", [button("x")])], [], "f", { label: "x", icon: "no no", when: "" })).toEqual({ problem: "icon" });
  });
});
