import { describe, it, expect } from "vitest";
import { isStillFresh, paletteGithubItemId, paletteGithubItems } from "../../../src/composables/paletteGithubItems";

const PR = {
  number: 12,
  title: "Fix login",
  author: "a",
  updatedAt: "",
  url: "https://github.com/acme/app/pull/12",
  isDraft: false,
  review: null,
  ci: "none" as const,
};
const ISSUE = { number: 34, title: "Slow list", author: "b", updatedAt: "", url: "https://github.com/acme/api/issues/34" };

describe("paletteGithubItems", () => {
  it("lists every repo's PRs, then every repo's Issues, each with its repo", () => {
    expect(paletteGithubItems([{ repo: "acme/app", rows: [PR] }], [{ repo: "acme/api", rows: [ISSUE] }])).toEqual([
      { kind: "pr", repo: "acme/app", number: 12, title: "Fix login", url: PR.url },
      { kind: "issue", repo: "acme/api", number: 34, title: "Slow list", url: ISSUE.url },
    ]);
  });

  it("leaves out a repo that failed and a row it cannot open", () => {
    const malformed: unknown[] = [{ number: "12", title: "no", url: "x" }, { number: 1, title: "no url" }, null];
    expect(
      paletteGithubItems(
        [
          { repo: "acme/down", rows: [] },
          { repo: "acme/app", rows: malformed },
        ],
        [],
      ),
    ).toEqual([]);
  });

  it("names a row by repo and number, so two repos' #1 stay apart", () => {
    const [a, b] = paletteGithubItems(
      [
        { repo: "acme/app", rows: [{ ...PR, number: 1 }] },
        { repo: "acme/api", rows: [{ ...PR, number: 1 }] },
      ],
      [],
    );
    expect(a && paletteGithubItemId(a)).toBe("pr:acme/app#1");
    expect(b && paletteGithubItemId(b)).toBe("pr:acme/api#1");
  });
});

describe("paletteGithubItems — what gets a row", () => {
  // Handed to window.open, so a row is a web page and nothing else.
  it("drops a row whose url is not an https page", () => {
    const rows: unknown[] = ["javascript:alert(1)", "file:///etc/passwd", "http://example.com/1", "https://github.com/a/b/pull/1"].map((url, i) => ({
      ...PR,
      number: i + 1,
      url,
    }));
    expect(paletteGithubItems([{ repo: "a/b", rows }], []).map((item) => item.url)).toEqual(["https://github.com/a/b/pull/1"]);
  });

  it("drops a row without a positive whole number", () => {
    const rows: unknown[] = [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 7].map((number) => ({ ...PR, number }));
    expect(paletteGithubItems([{ repo: "a/b", rows }], []).map((item) => item.number)).toEqual([7]);
  });

  // A GitLab repo numbers its merge requests and its issues apart, so one number can be both.
  it("keeps a PR and an Issue with one number apart", () => {
    const [pr, issue] = paletteGithubItems([{ repo: "g/l", rows: [PR] }], [{ repo: "g/l", rows: [{ ...ISSUE, number: 12 }] }]);
    expect(pr && issue && paletteGithubItemId(pr) !== paletteGithubItemId(issue)).toBe(true);
  });
});

describe("isStillFresh", () => {
  it("keeps an answer until it is the given age, and not a moment longer", () => {
    expect(isStillFresh(1000, 1000, 500)).toBe(true);
    expect(isStillFresh(1000, 1499, 500)).toBe(true);
    expect(isStillFresh(1000, 1500, 500)).toBe(false);
  });

  it("does not trust an answer from the future, as after the clock moved back", () => {
    expect(isStillFresh(2000, 1000, 500)).toBe(false);
  });
});
