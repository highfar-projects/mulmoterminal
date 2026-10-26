// @vitest-environment node
import { describe, it, expect, vi } from "vitest";

const runGh = vi.hoisted(() =>
  vi.fn(async (args: string[]) => {
    if (args[1] === "view" && args[2] === "99") return { ok: false, stdout: "", stderr: "Could not resolve to an Issue" };
    if (args[0] === "issue" && args[1] === "view")
      return { ok: true, stdout: JSON.stringify({ number: Number(args[2]), url: "https://github.com/o/r/issues/4", body: "b" }), stderr: "" };
    if (args[0] === "pr" && args[1] === "view")
      return { ok: true, stdout: JSON.stringify({ number: Number(args[2]), url: "https://github.com/o/r/pull/5" }), stderr: "" };
    if (args[0] === "repo") return { ok: true, stdout: "main\n", stderr: "" };
    if (args[0] === "pr" && args.includes("open")) {
      const verdict = { authorAssociation: "MEMBER", createdAt: "2026-10-26T04:00:00Z", body: "CODEX VERDICT: LGTM (head abc1234)" };
      const pr = { number: 5, title: "t", url: "https://github.com/o/r/pull/5", headRefName: "feat/x", headRefOid: "abc1234def", comments: [verdict] };
      return { ok: true, stdout: JSON.stringify([pr]), stderr: "" };
    }
    return { ok: true, stdout: "[]", stderr: "" };
  }),
);
vi.mock("../../../server/git/gh.js", () => ({ runGh }));
vi.mock("../../../server/git/git-status.js", () => ({ currentBranch: vi.fn(async () => ({ branch: "feat/x", detached: false })) }));
vi.mock("../../../server/git/forge-support.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../server/git/forge-support.js")>()),
  repoForDir: vi.fn(async () => ({ forge: { kind: "github", host: "github.com", path: "o/r" }, repo: "o/r" })),
}));

const { boardAcrossRepos, boardDetail } = await import("../../../server/git/board-fetch");

const cell = { session: "s1", cwd: "/w/a", working: true, waiting: false };

describe("boardAcrossRepos", () => {
  it.each(["o/r", "O/R", "github.com/o/r"])("places a cell on the PR of its branch when the repo is configured as %s", async (entry) => {
    const [board] = await boardAcrossRepos([entry], [cell]);
    expect(board?.cards?.find((card) => card.key === "pr-5")?.cells.map((c) => c.session)).toEqual(["s1"]);
  });

  it("reads comments, and so codex verdicts, for open PRs only", async () => {
    runGh.mockClear();
    const [board] = await boardAcrossRepos(["o/r"], []);
    expect(board?.cards?.find((card) => card.key === "pr-5")?.pr?.codex).toEqual({ verdicts: 1, more: false, latest: "lgtm", head: "current" });
    const fieldsFor = (state: string): string[] => {
      const call = runGh.mock.calls.find(([args]) => args[1] === "list" && args.includes(state));
      return (call?.[0][call[0].indexOf("--json") + 1] ?? "").split(",");
    };
    expect(fieldsFor("open")).toContain("comments");
    expect(fieldsFor("merged")).not.toContain("comments");
    expect(fieldsFor("merged")).toContain("reviews");
  });

  it("answers a non-GitHub repo with its own error", async () => {
    const [board] = await boardAcrossRepos(["gitlab.com/g/p"], [cell]);
    expect(board?.cards).toBeUndefined();
    expect(board?.error).toBeTruthy();
  });
});

describe("boardDetail", () => {
  it("reads the issue and the PR of a configured repo, asking gh by owner/repo", async () => {
    const detail = await boardDetail("o/r", ["github.com/O/R"], 4, 5);
    expect(detail).toMatchObject({ issue: { number: 4, body: "b" }, pr: { number: 5 }, errors: [] });
    expect(runGh).toHaveBeenCalledWith(["issue", "view", "4", "--repo", "O/R", "--json", expect.any(String)]);
  });

  it("still shows one part when the other cannot be read", async () => {
    const detail = await boardDetail("o/r", ["o/r"], 99, 5);
    expect(detail?.issue).toBeNull();
    expect(detail?.pr).toMatchObject({ number: 5 });
    expect(detail?.errors).toEqual(["issue #99: Could not resolve to an Issue"]);
  });

  it("asks gh only for the parts requested", async () => {
    runGh.mockClear();
    expect(await boardDetail("o/r", ["o/r"], null, 5)).toMatchObject({ issue: null, pr: { number: 5 } });
    expect(runGh).toHaveBeenCalledTimes(1);
  });

  it("is null for a repo that is not configured, or not on GitHub", async () => {
    expect(await boardDetail("o/other", ["o/r"], 4, null)).toBeNull();
    expect(await boardDetail("gitlab.com/g/p", ["gitlab.com/g/p"], 4, null)).toBeNull();
  });
});
