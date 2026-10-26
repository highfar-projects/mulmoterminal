import { describe, it, expect, vi, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import GithubBoard from "../../../src/components/GithubBoard.vue";
import { defineComponent, h, nextTick, ref } from "vue";
import { gridSessionJump, useGridSessionJump } from "../../../src/composables/gridSessionJump";
import type { GridState } from "../../../src/components/gridTabs";
import type { BoardCard, BoardDetailResponse, BoardResponse } from "../../../common/githubBoard";
import { boardSelection } from "../../../src/composables/useGithubBoardView";

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

const detail: BoardDetailResponse = {
  issue: { number: 4, title: "make it work", url: "https://github.com/o/r/issues/4", author: "alice", labels: ["bug"], body: "## Steps\n\nrun **it**" },
  pr: {
    number: 10,
    title: "feat: it works",
    url: "https://github.com/o/r/pull/10",
    author: "bob",
    body: "",
    isDraft: false,
    additions: 12,
    deletions: 3,
    checks: [
      { name: "lint", ci: "passing", url: "https://ci/lint" },
      { name: "test", ci: "failing", url: "" },
    ],
    reviews: [{ author: "codex", state: "CHANGES_REQUESTED", commit: "abcdef0", submittedAt: "" }],
  },
  errors: ["issue #99: gone"],
};

// The board and, behind it, one card's detail; every request is recorded.
function serveBoardAndDetail(board: BoardResponse): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (url: string) => new Response(JSON.stringify(url.startsWith("/api/github/board/detail") ? detail : board)));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  gridSessionJump.value = null;
  boardSelection.value = null;
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

  it("follows the grid's cells while the board is open", async () => {
    const state = ref<GridState>({ cells: [], expanded: null, page: 0, nextUid: 1, sortMode: "manual", arrangement: "grid" });
    const grid = mount(defineComponent({ setup: () => useGridSessionJump(state, () => undefined), render: () => h("div") }));
    serve({ repos: [{ repo: "o/r", cards: [prCard] }] });
    const w = mount(GithubBoard);
    await flushPromises();
    const inGridButton = () => w.findAll('[data-testid="board-cell"]')[0];
    expect(inGridButton()?.attributes("disabled")).toBeDefined();
    state.value.cells.push({ uid: 1, session: "in-grid", cwd: "/w/a" });
    await nextTick();
    expect(inGridButton()?.attributes("disabled")).toBeUndefined();
    state.value.cells.splice(0, 1);
    await nextTick();
    expect(inGridButton()?.attributes("disabled")).toBeDefined();
    grid.unmount();
  });

  it("links nowhere from a card: GitHub is reached from its detail panel", async () => {
    serve({ repos: [{ repo: "o/r", cards: [prCard] }] });
    const w = mount(GithubBoard);
    await flushPromises();
    expect(w.get('[data-testid="board-card"]').findAll("a")).toHaveLength(0);
  });

  it("opens a card's detail panel with the issue body, the checks and the reviews", async () => {
    const fetchMock = serveBoardAndDetail({ repos: [{ repo: "o/r", cards: [prCard] }] });
    const w = mount(GithubBoard);
    await flushPromises();
    await w.get('[data-testid="board-card-open"]').trigger("click");
    await flushPromises();
    expect(fetchMock).toHaveBeenCalledWith("/api/github/board/detail?repo=o%2Fr&issue=4&pr=10", expect.anything());
    const panel = w.get('[data-testid="board-detail"]');
    expect(panel.get('[data-testid="board-detail-issue"]').html()).toContain("<strong>it</strong>");
    expect(panel.findAll('[data-testid="board-detail-check"]').map((row) => row.text())).toEqual(["lint", "test"]);
    expect(panel.get('[data-testid="board-detail-review"]').text()).toContain("CHANGES_REQUESTED");
    expect(panel.text()).toContain("issue #99: gone");
    expect(panel.findAll("a").map((link) => link.attributes("href"))).toEqual(
      expect.arrayContaining(["https://github.com/o/r/pull/10", "https://github.com/o/r/issues/4"]),
    );
  });

  it("links no GitHub-supplied URL that is not https", async () => {
    const hostile: BoardDetailResponse = {
      ...detail,
      issue: detail.issue && { ...detail.issue, url: "javascript:alert(1)" },
      pr: detail.pr && { ...detail.pr, url: "data:text/html,x", checks: [{ name: "evil", ci: "failing", url: "javascript:alert(2)" }] },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async (url: string) =>
          new Response(JSON.stringify(url.startsWith("/api/github/board/detail") ? hostile : { repos: [{ repo: "o/r", cards: [prCard] }] })),
      ),
    );
    const w = mount(GithubBoard);
    await flushPromises();
    await w.get('[data-testid="board-card-open"]').trigger("click");
    await flushPromises();
    const panel = w.get('[data-testid="board-detail"]');
    expect(panel.get('[data-testid="board-detail-check"]').text()).toBe("evil");
    expect(panel.findAll("a").map((link) => link.attributes("href"))).toEqual([]);
  });

  it("closes the panel when the same card is pressed again, or its close button", async () => {
    serveBoardAndDetail({ repos: [{ repo: "o/r", cards: [prCard] }] });
    const w = mount(GithubBoard);
    await flushPromises();
    const open = w.get('[data-testid="board-card-open"]');
    await open.trigger("click");
    expect(w.find('[data-testid="board-detail"]').exists()).toBe(true);
    await open.trigger("click");
    expect(w.find('[data-testid="board-detail"]').exists()).toBe(false);
    await open.trigger("click");
    await w.get('[data-testid="board-detail"] header button').trigger("click");
    expect(w.find('[data-testid="board-detail"]').exists()).toBe(false);
  });

  it("asks GitHub nothing for a card with neither an issue nor a PR", async () => {
    const branchOnly = card({ key: "branch-x", column: "implementing", branch: "x", cells: prCard.cells });
    const fetchMock = serveBoardAndDetail({ repos: [{ repo: "o/r", cards: [branchOnly] }] });
    const w = mount(GithubBoard);
    await flushPromises();
    await w.get('[data-testid="board-card-open"]').trigger("click");
    await flushPromises();
    expect(fetchMock.mock.calls.filter(([url]) => String(url).startsWith("/api/github/board/detail"))).toHaveLength(0);
    expect(w.get('[data-testid="board-detail"]').findAll('[data-testid="board-cell"]')).toHaveLength(2);
  });

  it("drops the selection when the card is gone after a refresh", async () => {
    boardSelection.value = { repo: "o/r", key: "pr-gone" };
    serveBoardAndDetail({ repos: [{ repo: "o/r", cards: [prCard] }] });
    mount(GithubBoard);
    await flushPromises();
    expect(boardSelection.value).toBeNull();
  });

  it("starts a todo card's issue with the text sent, and reloads the board", async () => {
    const todo = card({ key: "issue-4", issue: { number: 4, title: "make it work", url: "u" } });
    const urls: string[] = [];
    const bodies: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        urls.push(url);
        if (url === "/api/repo-dirs")
          return new Response(JSON.stringify({ repos: [{ repo: "o/r", dirs: [{ path: "/w/r", label: "r", orderPriority: null }], primary: "/w/r" }] }));
        if (url === "/api/issues/start") {
          bodies.push(JSON.parse(String(init?.body)));
          return new Response(JSON.stringify({ ok: true, sessionId: "s-new", outcome: "created", seedRuns: true }));
        }
        if (url === "/api/github/board") return new Response(JSON.stringify({ repos: [{ repo: "o/r", cards: [todo] }] }));
        return new Response("{}");
      }),
    );
    const w = mount(GithubBoard);
    await flushPromises();
    await w.get('[data-testid="board-column-todo"] [data-testid="issue-start"]').trigger("click");
    await flushPromises();
    expect(bodies).toEqual([expect.objectContaining({ repo: "o/r", issue: 4, dir: "/w/r", run: true })]);
    expect(urls.filter((url) => url === "/api/github/board")).toHaveLength(2);
  });

  it("offers no start on a card that is not todo", async () => {
    serve({ repos: [{ repo: "o/r", cards: [prCard] }] });
    const w = mount(GithubBoard);
    await flushPromises();
    expect(w.find('[data-testid="issue-start"]').exists()).toBe(false);
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
