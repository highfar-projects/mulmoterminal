// The GitHub view's open PRs and Issues as command-palette rows (#2517). Pure.
import { isRecord } from "../../common/isRecord";
import type { GhItemBase } from "../../common/ghItems";

export interface PaletteGithubItem {
  kind: "pr" | "issue";
  repo: string;
  number: number;
  title: string;
  url: string;
}

const isGhItem = (value: unknown): value is GhItemBase =>
  isRecord(value) && typeof value.number === "number" && typeof value.title === "string" && typeof value.url === "string";

const itemsOf = (kind: PaletteGithubItem["kind"], repo: string, rows: readonly unknown[]): PaletteGithubItem[] =>
  rows.filter(isGhItem).map((row) => ({ kind, repo, number: row.number, title: row.title, url: row.url }));

/** One repo's list as it came off the wire: only `repo` is known, and each row is checked here. */
export interface RepoRows {
  repo: string;
  rows: readonly unknown[];
}

export function paletteGithubItems(prs: readonly RepoRows[], issues: readonly RepoRows[]): PaletteGithubItem[] {
  return [...prs.flatMap((repo) => itemsOf("pr", repo.repo, repo.rows)), ...issues.flatMap((repo) => itemsOf("issue", repo.repo, repo.rows))];
}

export const paletteGithubItemId = ({ repo, number }: PaletteGithubItem): string => `${repo}#${number}`;

/** Whether an answer read at `readAt` may still be shown at `now`. */
export const isStillFresh = (readAt: number, now: number, maxAge_ms: number): boolean => now >= readAt && now - readAt < maxAge_ms;
