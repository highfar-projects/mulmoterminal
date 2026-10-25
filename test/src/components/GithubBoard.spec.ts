import { describe, it, expect, vi, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import GithubBoard from "../../../src/components/GithubBoard.vue";
import { gridSessionJump } from "../../../src/composables/gridSessionJump";
import type { BoardCard, BoardResponse } from "../../../common/githubBoard";

const card = (over: Partial<BoardCard>): BoardCard => ({ key: "k", column: "todo", issue: null, pr: null, branch: null, cells: [], ...over });

const prCard: BoardCard = card({
  key: "pr-10",
  column: "review",
  issue: { number: 4, title: "make it work", url: "https://github.com/o/r/issues/4" },
  pr: {
    number: 10,
    title: "feat: it works",
    url: "https://github.com/o/r/pull/10",
    branch: "feat/4-x",
    isDraft: false,
    ci: "pending",
    review: null,
    reviewRounds: 2,
    headReviewed: false,
  },
  branch: "feat/4-x",
  cells: [
    { session: "in-grid", cwd: "/w/a", working: false, waiting: true },
    { session: "elsewhere", cwd: "/w/b", working: true, waiting: false },
  ],
});

function serve(response: BoardResponse | null): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => (response ? new Response(JSON.stringify(response)) : new Response("{}", { status: 500 }))),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  gridSessionJump.value = null;
});

describe("GithubBoard", () => {
  it("places each card in its column, with the issue, the PR and its review round", async () => {
    serve({ repos: [{ repo: "o/r", cards: [card({ key: "issue-1", issue: { number: 1, title: "todo thing", url: "u" } }), prCard] }] });
    const w = mount(GithubBoard);
    await flushPromises();
    expect(w.get('[data-testid="board-column-todo"]').text()).toContain("todo thing");
    const review = w.get('[data-testid="board-column-review"]');
    expect(review.text()).toContain("make it work");
    expect(review.text()).toContain("PR #10");
    expect(review.get('[data-testid="board-review-round"]').text()).toBe("Review 2");
    expect(w.get('[data-testid="board-column-qa"]').findAll('[data-testid="board-card"]')).toHaveLength(0);
  });

  it("jumps to a cell the grid holds and disables one it does not", async () => {
    const goTo = vi.fn();
    gridSessionJump.value = { has: (session) => session === "in-grid", goTo };
    serve({ repos: [{ repo: "o/r", cards: [prCard] }] });
    const w = mount(GithubBoard);
    await flushPromises();
    const [inGrid, elsewhere] = w.findAll('[data-testid="board-cell"]');
    expect(inGrid?.text()).toContain("Waiting for you");
    expect(elsewhere?.text()).toContain("Working");
    expect(elsewhere?.attributes("disabled")).toBeDefined();
    await inGrid?.trigger("click");
    expect(goTo).toHaveBeenCalledWith("in-grid");
  });

  it("disables every cell when no grid is mounted", async () => {
    serve({ repos: [{ repo: "o/r", cards: [prCard] }] });
    const w = mount(GithubBoard);
    await flushPromises();
    expect(w.findAll('[data-testid="board-cell"]').every((button) => button.attributes("disabled") !== undefined)).toBe(true);
  });

  it("shows a repo's own error in place of its columns", async () => {
    serve({ repos: [{ repo: "gitlab.example/g/p", error: "only GitHub repositories are shown on the board" }] });
    const w = mount(GithubBoard);
    await flushPromises();
    expect(w.text()).toContain("only GitHub repositories are shown on the board");
    expect(w.find('[data-testid="board-column-todo"]').exists()).toBe(false);
  });

  it("says the board could not be read when the request fails", async () => {
    serve(null);
    const w = mount(GithubBoard);
    await flushPromises();
    expect(w.text()).toContain("Could not read the board.");
  });
});
