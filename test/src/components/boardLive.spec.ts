import { describe, it, expect } from "vitest";
import { boardSessionIds, cardWaiting, finishedTurns, withLiveCells } from "../../../src/components/boardLive";
import type { BoardCard, BoardCell, RepoBoard } from "../../../common/githubBoard";

const cell = (session: string, over: Partial<BoardCell> = {}): BoardCell => ({ session, cwd: `/w/${session}`, working: false, waiting: false, ...over });
const card = (key: string, cells: BoardCell[]): BoardCard => ({ key, column: "implementing", issue: null, pr: null, branch: key, cells });
const live = (working: boolean, waiting: boolean) => ({ working, waiting, event: null });

describe("boardSessionIds", () => {
  it("lists every cell's session once, across cards and repos", () => {
    const repos: RepoBoard[] = [
      { repo: "o/a", cards: [card("x", [cell("s1"), cell("s2")]), card("y", [cell("s1")])] },
      { repo: "o/b", cards: [card("z", [cell("s3")])] },
      { repo: "o/c", error: "nope" },
    ];
    expect(boardSessionIds(repos)).toEqual(["s1", "s2", "s3"]);
  });

  it("is empty for a board with no cells", () => {
    expect(boardSessionIds([])).toEqual([]);
    expect(boardSessionIds([{ repo: "o/a", cards: [card("x", [])] }])).toEqual([]);
  });
});

describe("withLiveCells", () => {
  const repos: RepoBoard[] = [
    { repo: "o/a", cards: [card("x", [cell("s1", { working: true }), cell("s2", { waiting: true })])] },
    { repo: "o/c", error: "nope" },
  ];

  it("takes each cell's state from the feed where the feed has it", () => {
    const out = withLiveCells(repos, new Map([["s1", live(false, true)]]));
    expect(out[0]?.cards?.[0]?.cells).toEqual([cell("s1", { working: false, waiting: true }), cell("s2", { waiting: true })]);
  });

  it("leaves the loaded board untouched, and passes an errored repo through", () => {
    const out = withLiveCells(repos, new Map([["s1", live(false, false)]]));
    expect(repos[0]?.cards?.[0]?.cells[0]?.working).toBe(true);
    expect(out[1]).toEqual({ repo: "o/c", error: "nope" });
  });
});

describe("cardWaiting", () => {
  it("is true when any cell waits, false otherwise", () => {
    expect(cardWaiting(card("x", [cell("s1"), cell("s2", { waiting: true })]))).toBe(true);
    expect(cardWaiting(card("x", [cell("s1", { working: true })]))).toBe(false);
    expect(cardWaiting(card("x", []))).toBe(false);
  });
});

describe("finishedTurns", () => {
  const map = (entries: [string, boolean][]) => new Map(entries);

  it("names a session that went from working to idle, or closed while working", () => {
    expect(
      finishedTurns(
        map([
          ["s1", true],
          ["s2", true],
        ]),
        map([["s1", false]]),
      ),
    ).toEqual(["s1", "s2"]);
  });

  it("names nothing for a session that starts, stays working, or stays idle", () => {
    expect(
      finishedTurns(
        map([
          ["s1", false],
          ["s2", true],
        ]),
        map([
          ["s1", true],
          ["s2", true],
          ["s3", true],
        ]),
      ),
    ).toEqual([]);
    expect(finishedTurns(map([["s1", false]]), map([]))).toEqual([]);
    expect(finishedTurns(map([]), map([["s1", false]]))).toEqual([]);
  });
});
