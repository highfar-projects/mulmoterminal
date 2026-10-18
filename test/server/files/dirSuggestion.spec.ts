// @vitest-environment node
//
// The completion rules behind the launch form's Working directory suggestions: which directory is
// read, which of its children are offered, and in what spelling.
import { describe, it, expect } from "vitest";
import path from "node:path";
import { completionTarget, dirSuggestions, matchingNames, MAX_DIR_SUGGESTIONS } from "../../../server/files/dirSuggestion.js";

const HOME = path.resolve("/home/me");

describe("completionTarget", () => {
  it("reads the parent of a partial last segment", () => {
    expect(completionTarget("/srv/pro", HOME)).toEqual({ parentDir: "/srv/", namePrefix: "pro", typedParent: "/srv/" });
  });

  it("reads the directory itself when the text ends in a separator", () => {
    expect(completionTarget("/srv/projects/", HOME)).toEqual({ parentDir: "/srv/projects/", namePrefix: "", typedParent: "/srv/projects/" });
  });

  it("reads the root for a single slash", () => {
    expect(completionTarget("/", HOME)).toEqual({ parentDir: "/", namePrefix: "", typedParent: "/" });
  });

  it("expands a leading ~ but keeps it in the typed spelling", () => {
    expect(completionTarget("~/ss/ll", HOME)).toEqual({ parentDir: path.join(HOME, "ss/"), namePrefix: "ll", typedParent: "~/ss/" });
  });

  it("treats a bare ~ as the home directory's children", () => {
    expect(completionTarget("~", HOME)).toEqual({ parentDir: HOME, namePrefix: "", typedParent: "~/" });
  });

  it.each([
    ["empty text", ""],
    ["a bare name", "projects"],
    ["a relative path", "src/comp"],
    ["another user's home", "~bob/x"],
    ["a dot path", "./x"],
  ])("has nothing to read for %s", (_case, typed) => {
    expect(completionTarget(typed, HOME)).toBeNull();
  });
});

describe("matchingNames", () => {
  it("keeps the names starting with the prefix, ignoring case, sorted", () => {
    expect(matchingNames(["Mulmo", "mulmoterminal", "other", "mulmoclaude"], "mul")).toEqual(["Mulmo", "mulmoclaude", "mulmoterminal"]);
  });

  it("offers everything for an empty prefix except hidden names", () => {
    expect(matchingNames([".git", "src", ".cache", "docs"], "")).toEqual(["docs", "src"]);
  });

  it("offers hidden names once the prefix starts with a dot", () => {
    expect(matchingNames([".git", ".github", "src"], ".gi")).toEqual([".git", ".github"]);
  });

  it("leaves out the name already typed in full", () => {
    expect(matchingNames(["app", "app2", "apple"], "app")).toEqual(["app2", "apple"]);
  });

  it("caps the list", () => {
    const names = Array.from({ length: MAX_DIR_SUGGESTIONS + 10 }, (_, index) => `d${String(index).padStart(3, "0")}`);
    expect(matchingNames(names, "d")).toHaveLength(MAX_DIR_SUGGESTIONS);
    expect(matchingNames(names, "d", 3)).toEqual(["d000", "d001", "d002"]);
  });

  it("is empty when nothing matches", () => {
    expect(matchingNames([], "x")).toEqual([]);
    expect(matchingNames(["a", "b"], "x")).toEqual([]);
  });
});

describe("dirSuggestions", () => {
  it("returns completions in the typed spelling, reading only the parent", async () => {
    const read: string[] = [];
    const list = async (dir: string) => {
      read.push(dir);
      return ["llm", "lldb", "other"];
    };
    expect(await dirSuggestions("~/ss/ll", HOME, list)).toEqual(["~/ss/lldb", "~/ss/llm"]);
    expect(read).toEqual([path.join(HOME, "ss/")]);
  });

  it("reads nothing for text that names no absolute directory", async () => {
    const list = async () => {
      throw new Error("must not be called");
    };
    expect(await dirSuggestions("relative/x", HOME, list)).toEqual([]);
  });
});
