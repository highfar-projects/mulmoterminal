import { describe, it, expect } from "vitest";
import { GIT_LETTER, gitDecorations } from "../../../src/components/filesGitDecorations";
import { gitFilesFrom } from "../../../src/composables/useFilesGitStatus";

// #2496. Which rows of the Files tree carry a mark.
describe("gitDecorations", () => {
  const git = gitDecorations({ "src/deep/a.ts": "modified", "docs/new.md": "untracked", build: "untracked" });

  it("gives a changed file its own state", () => {
    expect(git.stateOf("src/deep/a.ts")).toBe("modified");
    expect(git.stateOf("docs/new.md")).toBe("untracked");
    expect(git.stateOf("src/other.ts")).toBeNull();
  });

  it("marks every folder above a change, and no other", () => {
    expect(["src", "src/deep", "docs"].map(git.holdsChanges)).toEqual([true, true, true]);
    expect(["lib", "src/deep/a.ts", "sr", "src/dee"].map(git.holdsChanges)).toEqual([false, false, false, false]);
  });

  // git reports an untracked folder whole; the folder carries the state itself.
  it("gives an untracked folder git reported whole its own state", () => {
    expect(git.stateOf("build")).toBe("untracked");
  });

  it("does not find Object.prototype for a file named after one of its keys", () => {
    expect(gitDecorations({}).stateOf("constructor")).toBeNull();
    expect(gitDecorations({}).stateOf("__proto__")).toBeNull();
  });

  it("has a letter for every state", () => {
    expect(GIT_LETTER).toEqual({ modified: "M", added: "A", untracked: "U", deleted: "D", renamed: "R" });
  });
});

describe("gitFilesFrom", () => {
  it("keeps the entries whose state it knows", () => {
    expect(gitFilesFrom({ repo: true, files: { "a.ts": "modified", "b.ts": "exploded", "c.ts": 7 } })).toEqual({ "a.ts": "modified" });
  });

  it.each([[null], [undefined], ["x"], [{}], [{ files: null }], [{ files: [] }]])("reads %j as nothing", (body) => {
    expect(gitFilesFrom(body)).toEqual({});
  });
});
