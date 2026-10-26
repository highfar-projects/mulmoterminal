// What GET /api/github/board answers with (#3172): per repo, one card per piece of work — the issue,
// the PR that closes it, and the live cells on its branch — placed in a column. Shared because the
// server decides the column and the board renders it.
import type { CiState } from "./ghItems.js";

export const BOARD_COLUMNS = ["todo", "implementing", "review", "qa", "merged"] as const;

export type BoardColumn = (typeof BOARD_COLUMNS)[number];

export interface BoardIssue {
  number: number;
  title: string;
  url: string;
}

export interface BoardPr {
  number: number;
  title: string;
  url: string;
  branch: string;
  isDraft: boolean;
  ci: CiState;
  /** gh reviewDecision, or null when the repo requires none. */
  review: string | null;
  /** Distinct commits that received a review — one per push a reviewer looked at. */
  reviewRounds: number;
  /** Whether the newest commit has been reviewed yet. */
  headReviewed: boolean;
}

export interface BoardCell {
  session: string;
  cwd: string;
  working: boolean;
  waiting: boolean;
}

export interface BoardCard {
  /** Stable within a repo: `pr-N`, `issue-N` or `branch-<name>`. */
  key: string;
  column: BoardColumn;
  issue: BoardIssue | null;
  pr: BoardPr | null;
  /** The branch the work is on, when there is one — the PR's head, or a cell's branch with no PR. */
  branch: string | null;
  cells: BoardCell[];
}

export interface RepoBoard {
  repo: string;
  cards?: BoardCard[];
  error?: string;
}

export interface BoardResponse {
  repos: RepoBoard[];
}
