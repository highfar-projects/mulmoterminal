// @vitest-environment node
import { describe, it, expect } from "vitest";
import { parseBoardDetailQuery, parseIssueDetail, parsePrDetail } from "../../../server/git/board-detail";

describe("parseIssueDetail", () => {
  it("reads the author, the label names and the body", () => {
    const raw = {
      number: 4,
      title: "make it work",
      url: "https://github.com/o/r/issues/4",
      author: { login: "alice" },
      labels: [{ name: "bug" }, { name: "" }, null, { color: "red" }],
      body: "## Steps\n1. run it",
    };
    expect(parseIssueDetail(raw)).toEqual({ number: 4, title: "make it work", url: raw.url, author: "alice", labels: ["bug"], body: raw.body });
  });

  it("reads missing optional fields as empty", () => {
    expect(parseIssueDetail({ number: 1, url: "u" })).toEqual({ number: 1, title: "", url: "u", author: "", labels: [], body: "" });
  });

  it("is null without the identity fields", () => {
    expect(parseIssueDetail(null)).toBeNull();
    expect(parseIssueDetail({ number: 1 })).toBeNull();
    expect(parseIssueDetail({ url: "u" })).toBeNull();
    expect(parseIssueDetail("x")).toBeNull();
  });
});

describe("parsePrDetail", () => {
  const raw = {
    number: 10,
    title: "feat: it works",
    url: "https://github.com/o/r/pull/10",
    author: { login: "bob" },
    body: "Closes #4",
    isDraft: false,
    additions: 12,
    deletions: 3,
    statusCheckRollup: [
      { name: "lint", conclusion: "SUCCESS", detailsUrl: "https://ci/lint" },
      { name: "test", status: "IN_PROGRESS", conclusion: "" },
      { context: "deploy", state: "FAILURE", targetUrl: "https://ci/deploy" },
      "x",
    ],
    reviews: [{ author: { login: "codex" }, state: "COMMENTED", commit: { oid: "abcdef0123456" }, submittedAt: "2026-10-26T00:00:00Z" }, { state: "APPROVED" }],
  };

  it("reads each check with its own state and link, CheckRun and StatusContext alike", () => {
    expect(parsePrDetail(raw)?.checks).toEqual([
      { name: "lint", ci: "passing", url: "https://ci/lint" },
      { name: "test", ci: "pending", url: "" },
      { name: "deploy", ci: "failing", url: "https://ci/deploy" },
    ]);
  });

  it("reads each review with a short commit, and tolerates missing parts", () => {
    expect(parsePrDetail(raw)?.reviews).toEqual([
      { author: "codex", state: "COMMENTED", commit: "abcdef0", submittedAt: "2026-10-26T00:00:00Z" },
      { author: "", state: "APPROVED", commit: "", submittedAt: "" },
    ]);
  });

  it("reads the counts, and a missing or non-number count as 0", () => {
    expect(parsePrDetail(raw)).toMatchObject({ author: "bob", isDraft: false, additions: 12, deletions: 3 });
    expect(parsePrDetail({ number: 1, url: "u", additions: "12", deletions: Number.NaN })).toMatchObject({
      additions: 0,
      deletions: 0,
      checks: [],
      reviews: [],
    });
  });

  it("is null without the identity fields", () => {
    expect(parsePrDetail(undefined)).toBeNull();
    expect(parsePrDetail({ number: "10", url: "u" })).toBeNull();
  });
});

describe("parseBoardDetailQuery", () => {
  it("reads the repo and whichever numbers are present", () => {
    expect(parseBoardDetailQuery({ repo: "o/r", issue: "4", pr: "10" })).toEqual({ repo: "o/r", issue: 4, pr: 10 });
    expect(parseBoardDetailQuery({ repo: "o/r", pr: "10" })).toEqual({ repo: "o/r", issue: null, pr: 10 });
    expect(parseBoardDetailQuery({ repo: "o/r", issue: "4" })).toEqual({ repo: "o/r", issue: 4, pr: null });
  });

  it("refuses a query with neither number", () => {
    expect(parseBoardDetailQuery({ repo: "o/r" })).toBeNull();
  });

  it.each([["0"], ["-1"], ["4.5"], ["1e3"], [" 4"], [""], ["99999999999999999999"]])("refuses the number %j", (value) => {
    expect(parseBoardDetailQuery({ repo: "o/r", issue: value })).toBeNull();
  });

  it("refuses a repeated or nested number", () => {
    expect(parseBoardDetailQuery({ repo: "o/r", issue: ["4", "5"] })).toBeNull();
    expect(parseBoardDetailQuery({ repo: "o/r", pr: { n: "1" } })).toBeNull();
  });

  it.each([[undefined], [""], ["o"], ["--repo"], ["o/r x"], [["o/r"]]])("refuses the repo %j", (repo) => {
    expect(parseBoardDetailQuery({ repo, issue: "4" })).toBeNull();
  });
});
