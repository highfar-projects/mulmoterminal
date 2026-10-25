// @vitest-environment node
import { describe, it, expect, vi } from "vitest";

vi.mock("../../../server/git/gh.js", () => ({
  runGh: vi.fn(async (args: string[]) => {
    if (args[0] === "repo") return { ok: true, stdout: "main\n", stderr: "" };
    if (args[0] === "pr" && args.includes("open")) {
      return { ok: true, stdout: JSON.stringify([{ number: 5, title: "t", url: "https://github.com/o/r/pull/5", headRefName: "feat/x" }]), stderr: "" };
    }
    return { ok: true, stdout: "[]", stderr: "" };
  }),
}));
vi.mock("../../../server/git/git-status.js", () => ({ currentBranch: vi.fn(async () => ({ branch: "feat/x", detached: false })) }));
vi.mock("../../../server/git/forge-support.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../server/git/forge-support.js")>()),
  repoForDir: vi.fn(async () => ({ forge: { kind: "github", host: "github.com", path: "o/r" }, repo: "o/r" })),
}));

const { boardAcrossRepos } = await import("../../../server/git/board-fetch");

const cell = { session: "s1", cwd: "/w/a", working: true, waiting: false };

describe("boardAcrossRepos", () => {
  it.each(["o/r", "O/R", "github.com/o/r"])("places a cell on the PR of its branch when the repo is configured as %s", async (entry) => {
    const [board] = await boardAcrossRepos([entry], [cell]);
    expect(board?.cards?.find((card) => card.key === "pr-5")?.cells.map((c) => c.session)).toEqual(["s1"]);
  });

  it("answers a non-GitHub repo with its own error", async () => {
    const [board] = await boardAcrossRepos(["gitlab.com/g/p"], [cell]);
    expect(board?.cards).toBeUndefined();
    expect(board?.error).toBeTruthy();
  });
});
