// The GitHub board's inputs (#3172): per configured repo, its open and recently merged PRs and its
// open issues through `gh`, and the live cells whose directory is a checkout of it. The decisions
// are in board.ts; this file only gathers.
import type { BoardCell, BoardIssue, RepoBoard } from "../../common/githubBoard.js";
import { runGh } from "./gh.js";
import { buildRepoBoard, parseBoardPr, type BoardPrRow, type CellOnBranch } from "./board.js";
import { currentBranch } from "./git-status.js";
import { isSupported, repoForDir, repoSupport } from "./forge-support.js";
import { projectPath } from "./forge-host.js";
import { isRecord } from "../../common/isRecord.js";
import { readString } from "../../common/readString.js";
import { isUnknownArray } from "../../common/isUnknownArray.js";

export const BOARD_OPEN_LIMIT = 50;
export const BOARD_MERGED_LIMIT = 10;

const PR_FIELDS = "number,title,url,isDraft,reviewDecision,statusCheckRollup,headRefName,headRefOid,closingIssuesReferences,reviews";

/** A live cell before its repo and branch are known. */
export type LiveCell = BoardCell;

const ghJson = async (args: string[]): Promise<unknown[]> => {
  const res = await runGh(args);
  if (!res.ok) throw new Error((res.stderr.trim() || `gh ${args.slice(0, 2).join(" ")} failed`).slice(0, 300));
  const parsed: unknown = JSON.parse(res.stdout);
  return isUnknownArray(parsed) ? parsed : [];
};

const listPrs = async (repo: string, state: "open" | "merged", limit: number): Promise<BoardPrRow[]> =>
  (await ghJson(["pr", "list", "--repo", repo, "--state", state, "--limit", String(limit), "--json", PR_FIELDS])).flatMap(
    (raw) => parseBoardPr(raw, repo) ?? [],
  );

const listIssues = async (repo: string): Promise<BoardIssue[]> =>
  (await ghJson(["issue", "list", "--repo", repo, "--state", "open", "--limit", String(BOARD_OPEN_LIMIT), "--json", "number,title,url"])).flatMap(
    (raw): BoardIssue[] =>
      isRecord(raw) && typeof raw.number === "number" ? [{ number: raw.number, title: readString(raw.title), url: readString(raw.url) }] : [],
  );

// Null when it cannot be read: the board then shows a cell on any branch rather than guessing a name.
const defaultBranchOf = async (repo: string): Promise<string | null> => {
  const res = await runGh(["repo", "view", repo, "--json", "defaultBranchRef", "--jq", ".defaultBranchRef.name"]);
  return res.ok && res.stdout.trim() ? res.stdout.trim() : null;
};

// GitHub names are case-insensitive, and a `prRepos` entry may carry the host, so both sides meet on this.
const repoKey = (project: string): string => project.toLowerCase();

// Which repo and branch each cell's directory is on, resolved once per directory.
async function placeCells(cells: readonly LiveCell[]): Promise<Map<string, CellOnBranch[]>> {
  const byCwd = new Map<string, { repo: string; branch: string } | null>();
  await Promise.all(
    [...new Set(cells.map((cell) => cell.cwd))].map(async (cwd) => {
      const [dirRepo, head] = await Promise.all([repoForDir(cwd).catch(() => null), currentBranch(cwd).catch(() => ({ branch: null }))]);
      byCwd.set(cwd, dirRepo?.repo && head.branch ? { repo: dirRepo.repo, branch: head.branch } : null);
    }),
  );
  const out = new Map<string, CellOnBranch[]>();
  cells.forEach((cell) => {
    const place = byCwd.get(cell.cwd);
    if (place) out.set(repoKey(place.repo), [...(out.get(repoKey(place.repo)) ?? []), { ...cell, branch: place.branch }]);
  });
  return out;
}

async function repoBoard(repo: string, cells: readonly CellOnBranch[]): Promise<RepoBoard> {
  try {
    const [openPrs, mergedPrs, openIssues, defaultBranch] = await Promise.all([
      listPrs(repo, "open", BOARD_OPEN_LIMIT),
      listPrs(repo, "merged", BOARD_MERGED_LIMIT),
      listIssues(repo),
      defaultBranchOf(repo),
    ]);
    return { repo, cards: buildRepoBoard({ repo, defaultBranch, openPrs, mergedPrs, openIssues, cells }) };
  } catch (err) {
    return { repo, error: err instanceof Error ? err.message : String(err) };
  }
}

/** One board per repo. A repo that is not on GitHub, or that `gh` cannot read, carries an error. */
export async function boardAcrossRepos(repos: readonly string[], liveCells: readonly LiveCell[]): Promise<RepoBoard[]> {
  const cellsByRepo = await placeCells(liveCells);
  return Promise.all(
    repos.map(async (repo): Promise<RepoBoard> => {
      const support = repoSupport(repo);
      if (!isSupported(support)) return { repo, error: support.error };
      const project = support.forge.kind === "github" ? projectPath(support.forge) : null;
      if (!project) return { repo, error: "only GitHub repositories are shown on the board" };
      return repoBoard(project, cellsByRepo.get(repoKey(project)) ?? []);
    }),
  );
}
