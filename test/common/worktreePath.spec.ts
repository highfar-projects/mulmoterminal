import { describe, it, expect } from "vitest";
import { worktreeLabel, isManagedWorktreePath } from "../../common/worktreePath.js";

describe("worktreeLabel", () => {
  it("extracts <repo> and <task> from a managed worktree path", () => {
    expect(worktreeLabel("/Users/me/.mulmoterminal/worktrees/myrepo-1a2b3c4d/fix-login")).toEqual({ repo: "myrepo", task: "fix-login" });
  });
  it("keeps a repo name that itself contains dashes", () => {
    expect(worktreeLabel("/x/worktrees/my-cool-repo-deadbeef/task-2")).toEqual({ repo: "my-cool-repo", task: "task-2" });
  });
  it("handles Windows separators", () => {
    expect(worktreeLabel("C:\\Users\\me\\.mulmoterminal\\worktrees\\app-0badf00d\\wip")).toEqual({ repo: "app", task: "wip" });
  });
  it("returns null for non-worktree paths", () => {
    expect(worktreeLabel(null)).toBeNull();
    expect(worktreeLabel("/Users/me/ss/proj")).toBeNull();
    expect(worktreeLabel("/x/worktrees/no-hash-here/task")).toBeNull(); // dir lacks the -<8hex> suffix
    expect(worktreeLabel("/x/worktrees/app-1a2b3c4d")).toBeNull(); // no task segment
  });
});

// A worktree is one branch for one task and is deleted with it, so it is never a directory to
// offer as "launch here again" — and nothing prunes its chip when the directory goes. Both the
// browser's auto-record and `mulmoterminal init`'s seeding ask this, which is why it is here.
describe("isManagedWorktreePath", () => {
  it("recognises a managed worktree", () => {
    expect(isManagedWorktreePath("/home/me/worktrees/myrepo-1a2b3c4d/fix-bug")).toBe(true);
    expect(isManagedWorktreePath("C:\\Users\\me\\worktrees\\myrepo-1a2b3c4d\\fix-bug")).toBe(true);
  });

  it("leaves an ordinary project alone", () => {
    expect(isManagedWorktreePath("/home/me/my-project")).toBe(false);
    expect(isManagedWorktreePath("/home/me/mulmoclaude")).toBe(false);
  });

  // The hex suffix is what the server mints, and it is the whole reason a lexical test is safe
  // here: a directory the user happens to keep under a folder called `worktrees` is theirs.
  it("does not claim a hand-made directory under a folder named worktrees", () => {
    expect(isManagedWorktreePath("/home/me/worktrees/myrepo/fix-bug")).toBe(false);
    expect(isManagedWorktreePath("/home/me/worktrees/myrepo-zzzzzzzz/fix-bug")).toBe(false);
  });

  // The repo root itself, and the level above a task, are directories someone may well work in.
  it("does not claim the levels above a task", () => {
    expect(isManagedWorktreePath("/home/me/worktrees/myrepo-1a2b3c4d")).toBe(false);
    expect(isManagedWorktreePath("/home/me/worktrees")).toBe(false);
  });
});
