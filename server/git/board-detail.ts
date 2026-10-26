// The board's detail panel (#3177), pure: one `gh issue view --json` / `gh pr view --json` object
// read into the panel's shape. The `gh` calls are in board-fetch.ts.
import type { BoardCheck, BoardIssueDetail, BoardPrDetail, BoardReview } from "../../common/githubBoard.js";
import { isRecord } from "../../common/isRecord.js";
import { readString } from "../../common/readString.js";
import { rollupCiState } from "./prs.js";
import { isIssueNumber } from "../../common/prPhase.js";
import { isRepoEntry } from "../../common/repoEntry.js";

const SHORT_OID_LENGTH = 7;

export const ISSUE_DETAIL_FIELDS = "number,title,url,author,labels,body";
export const PR_DETAIL_FIELDS = "number,title,url,author,body,isDraft,additions,deletions,statusCheckRollup,reviews";

const records = (value: unknown): Record<string, unknown>[] => (Array.isArray(value) ? value.filter(isRecord) : []);

const login = (author: unknown): string => (isRecord(author) ? readString(author.login) : "");

const count = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) ? value : 0);

// A CheckRun names itself `name` and links `detailsUrl`; a StatusContext uses `context` and `targetUrl`.
const parseCheck = (raw: Record<string, unknown>): BoardCheck => ({
  name: readString(raw.name) || readString(raw.context),
  ci: rollupCiState([raw]),
  url: readString(raw.detailsUrl) || readString(raw.targetUrl),
});

const parseReview = (raw: Record<string, unknown>): BoardReview => ({
  author: login(raw.author),
  state: readString(raw.state),
  commit: isRecord(raw.commit) ? readString(raw.commit.oid).slice(0, SHORT_OID_LENGTH) : "",
  submittedAt: readString(raw.submittedAt),
});

type DetailBase = Pick<BoardIssueDetail, "number" | "title" | "url" | "author" | "body">;

// What an issue and a PR both carry, beside the record it came from; null without the identity fields.
const detailBase = (input: unknown): { base: DetailBase; raw: Record<string, unknown> } | null => {
  if (!isRecord(input) || typeof input.number !== "number" || typeof input.url !== "string") return null;
  return {
    base: { number: input.number, title: readString(input.title), url: input.url, author: login(input.author), body: readString(input.body) },
    raw: input,
  };
};

/** One `gh issue view --json` object, or null when it lacks the identity fields. */
export function parseIssueDetail(input: unknown): BoardIssueDetail | null {
  const parsed = detailBase(input);
  if (!parsed) return null;
  const labels = records(parsed.raw.labels).map((label) => readString(label.name));
  return { ...parsed.base, labels: labels.filter((name) => name !== "") };
}

/** One `gh pr view --json` object, or null when it lacks the identity fields. */
export function parsePrDetail(input: unknown): BoardPrDetail | null {
  const parsed = detailBase(input);
  if (!parsed) return null;
  const { raw } = parsed;
  return {
    ...parsed.base,
    isDraft: raw.isDraft === true,
    additions: count(raw.additions),
    deletions: count(raw.deletions),
    checks: records(raw.statusCheckRollup).map(parseCheck),
    reviews: records(raw.reviews).map(parseReview),
  };
}

export interface BoardDetailQuery {
  repo: string;
  issue: number | null;
  pr: number | null;
}

// Absent is null; present must be a positive integer written in digits, or the query is refused.
const queryNumber = (value: unknown): number | null | undefined => {
  if (value === undefined) return null;
  if (typeof value !== "string" || !/^\d+$/.test(value)) return undefined;
  const number = Number(value);
  return isIssueNumber(number) ? number : undefined;
};

/** `?repo=owner/repo&issue=N&pr=M`, with at least one of the numbers; null when malformed. */
export function parseBoardDetailQuery(query: Record<string, unknown>): BoardDetailQuery | null {
  const issue = queryNumber(query.issue);
  const pr = queryNumber(query.pr);
  if (typeof query.repo !== "string" || !isRepoEntry(query.repo) || issue === undefined || pr === undefined) return null;
  if (issue === null && pr === null) return null;
  return { repo: query.repo, issue, pr };
}
