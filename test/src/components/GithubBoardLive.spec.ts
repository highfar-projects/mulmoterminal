// The board keeping itself current (#3182): cells follow the `sessions` channel, a card whose cell is
// waiting stands out, and the board reads itself again after a cell on it finishes a turn.
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import type { BoardCard, BoardResponse } from "../../../common/githubBoard";
import { BOARD_POLL_MS, BOARD_TURN_RELOAD_DELAY_MS } from "../../../src/composables/useGithubBoardLive";

const subscribers = new Map<string, (data: unknown) => void>();
vi.mock("../../../src/composables/usePubSub", () => ({
  usePubSub: () => ({
    subscribe: (channel: string, handler: (data: unknown) => void) => {
      subscribers.set(channel, handler);
      return () => subscribers.delete(channel);
    },
    onReconnect: () => () => {},
  }),
}));

const GithubBoard = (await import("../../../src/components/GithubBoard.vue")).default;

const working: BoardCard = {
  key: "branch-feat/x",
  column: "implementing",
  issue: null,
  pr: null,
  branch: "feat/x",
  cells: [{ session: "s1", cwd: "/w/a", working: true, waiting: false }],
};

let boardLoads = 0;
let activitySeeds = 0;
let activitySeed: Record<string, unknown> = {};

beforeEach(() => {
  boardLoads = 0;
  activitySeeds = 0;
  activitySeed = {};
  subscribers.clear();
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url === "/api/github/board") {
        boardLoads++;
        const body: BoardResponse = { repos: [{ repo: "o/r", cards: [working] }] };
        return new Response(JSON.stringify(body));
      }
      if (url.startsWith("/api/activity")) {
        activitySeeds++;
        return new Response(JSON.stringify(activitySeed));
      }
      return new Response("{}");
    }),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const push = (data: unknown): void => subscribers.get("sessions")?.(data);

describe("GithubBoard, live", () => {
  it("shows a cell as the channel says it is now, and marks its card as waiting", async () => {
    const w = mount(GithubBoard);
    await flushPromises();
    expect(w.find('[data-testid="board-card-waiting"]').exists()).toBe(false);
    push({ id: "s1", working: false, waiting: true });
    await flushPromises();
    expect(w.find('[data-testid="board-card-waiting"]').exists()).toBe(true);
    expect(w.get('[data-testid="board-cell"]').text()).toContain("Waiting for you");
    expect(w.get('[data-testid="board-card"]').classes()).toContain("border-amber");
    w.unmount();
  });

  it("starts from the seeded state of the board's cells", async () => {
    activitySeed = { s1: { working: false, waiting: true } };
    const w = mount(GithubBoard);
    await flushPromises();
    await flushPromises();
    expect(w.find('[data-testid="board-card-waiting"]').exists()).toBe(true);
    w.unmount();
  });

  it("reads the board again shortly after a cell on it finishes a turn, and not before", async () => {
    const w = mount(GithubBoard);
    await flushPromises();
    push({ id: "s1", working: true, waiting: false });
    await flushPromises();
    expect(boardLoads).toBe(1);
    push({ id: "s1", working: false, waiting: false });
    await flushPromises();
    await vi.advanceTimersByTimeAsync(BOARD_TURN_RELOAD_DELAY_MS - 1);
    expect(boardLoads).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(boardLoads).toBe(2);
    w.unmount();
  });

  it("does not read again for a cell that only starts working", async () => {
    const w = mount(GithubBoard);
    await flushPromises();
    push({ id: "s1", working: true, waiting: false });
    await vi.advanceTimersByTimeAsync(BOARD_TURN_RELOAD_DELAY_MS * 2);
    expect(boardLoads).toBe(1);
    w.unmount();
  });

  it("reads the board again on its slow tick while the page is visible", async () => {
    const w = mount(GithubBoard);
    await flushPromises();
    await vi.advanceTimersByTimeAsync(BOARD_POLL_MS);
    expect(boardLoads).toBe(2);
    w.unmount();
  });

  it("does not re-seed the cells' state when a reload brings the same cells", async () => {
    const w = mount(GithubBoard);
    await flushPromises();
    const seedsAfterMount = activitySeeds;
    expect(seedsAfterMount).toBeGreaterThan(0);
    await vi.advanceTimersByTimeAsync(BOARD_POLL_MS);
    await flushPromises();
    expect(boardLoads).toBe(2);
    expect(activitySeeds).toBe(seedsAfterMount);
    w.unmount();
  });

  it("keeps the cards on screen when a later read fails", async () => {
    const w = mount(GithubBoard);
    await flushPromises();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 500 })),
    );
    await vi.advanceTimersByTimeAsync(BOARD_POLL_MS);
    await flushPromises();
    expect(w.findAll('[data-testid="board-card"]')).toHaveLength(1);
    expect(w.text()).toContain("Could not read the board.");
    w.unmount();
  });
});
