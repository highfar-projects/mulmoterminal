import { describe, it, expect } from "vitest";
import {
  RECENTLY_CLOSED_MAX,
  cellForClosed,
  closedCellId,
  closedCellOf,
  closedTitle,
  forgetClosed,
  readClosedCells,
  rememberClosed,
  reopenableClosed,
  type ClosedCell,
} from "../../../src/composables/recentlyClosed";
import type { TerminalAgent } from "../../../common/sessionAgent";
import { shellCell, shellLauncher, type Cell } from "../../../src/components/gridTabs";

const NOW = 1_000_000;
interface SessionExtra {
  agent?: TerminalAgent;
  account?: string | null;
  title?: string;
}
const session = (id: string, extra: SessionExtra = {}): ClosedCell => ({
  kind: "session",
  session: id,
  cwd: "/w/app",
  agent: extra.agent ?? "claude",
  account: extra.account ?? null,
  title: extra.title ?? `t-${id}`,
  closedAt: NOW,
});
const shellEntry = (cwd: string | null): ClosedCell => ({ kind: "shell", cwd, title: "", closedAt: NOW });

describe("closedCellOf", () => {
  it("records an agent cell by its session, agent and account", () => {
    const cell: Cell = { uid: 1, session: "s1", cwd: "/w/app", agent: "codex", account: "work" };
    expect(closedCellOf(cell, "Fix login", NOW)).toEqual({
      kind: "session",
      session: "s1",
      cwd: "/w/app",
      agent: "codex",
      account: "work",
      title: "Fix login",
      closedAt: NOW,
    });
  });

  it("reads an absent agent as claude and an absent account as the default login", () => {
    const closed = closedCellOf({ uid: 1, session: "s1", cwd: null }, "x", NOW);
    expect(closed).toMatchObject({ kind: "session", agent: "claude", account: null });
  });

  it("falls back to the directory name when there is no title", () => {
    expect(closedCellOf({ uid: 1, session: "s1", cwd: "/w/app/" }, null, NOW)?.title).toBe("app");
    expect(closedCellOf({ uid: 1, session: "s1", cwd: "/w/app" }, "   ", NOW)?.title).toBe("app");
    expect(closedCellOf({ uid: 1, session: "s1", cwd: null }, null, NOW)?.title).toBe("");
  });

  it("records a shell cell as a shell in its directory", () => {
    const cell: Cell = { uid: 1, session: "k", cwd: "/w/app", launcher: shellLauncher() };
    expect(closedCellOf(cell, null, NOW)).toEqual({ kind: "shell", cwd: "/w/app", title: "app", closedAt: NOW });
  });

  it("records nothing for a command cell, a configured launcher, or an empty cell", () => {
    expect(closedCellOf({ uid: 1, session: "s", cwd: "/w", command: { source: "script", index: 0, label: "test", cwd: "/w" } }, null, NOW)).toBeNull();
    expect(closedCellOf({ uid: 1, session: "s", cwd: "/w", launcher: { index: 0, label: "htop" } }, null, NOW)).toBeNull();
    expect(closedCellOf({ uid: 1, session: null, cwd: "/w" }, null, NOW)).toBeNull();
  });
});

describe("closedTitle", () => {
  const meta = { memo: null, aiTitle: null, agentTitle: null, lastPrompt: null };
  it("prefers the memo, then the agent's titles, then the prompt", () => {
    expect(closedTitle({ ...meta, memo: "m", aiTitle: "a", lastPrompt: "p" })).toBe("m");
    expect(closedTitle({ ...meta, aiTitle: "a", agentTitle: "g", lastPrompt: "p" })).toBe("a");
    expect(closedTitle({ ...meta, agentTitle: "g", lastPrompt: "p" })).toBe("g");
    expect(closedTitle({ ...meta, lastPrompt: "p" })).toBe("p");
    expect(closedTitle(meta)).toBeNull();
    expect(closedTitle(undefined)).toBeNull();
  });
});

describe("rememberClosed / forgetClosed", () => {
  it("puts the newest first and moves a re-closed entry up instead of listing it twice", () => {
    const list = rememberClosed(rememberClosed(rememberClosed([], session("a")), session("b")), session("a", { title: "new" }));
    expect(list.map(closedCellId)).toEqual(["session::a", "session::b"]);
    expect(list[0]?.title).toBe("new");
  });

  it("keeps the same conversation under two logins apart", () => {
    const list = rememberClosed(rememberClosed([], session("a")), session("a", { account: "work" }));
    expect(list.map(closedCellId)).toEqual(["session:work:a", "session::a"]);
  });

  it("keeps at most the cap, dropping the oldest", () => {
    const ids = Array.from({ length: RECENTLY_CLOSED_MAX + 3 }, (_, i) => `s${i}`);
    const list = ids.reduce<ClosedCell[]>((acc, id) => rememberClosed(acc, session(id)), []);
    expect(list).toHaveLength(RECENTLY_CLOSED_MAX);
    expect(list[0] && closedCellId(list[0])).toBe(`session::s${ids.length - 1}`);
    expect(list.map(closedCellId)).not.toContain("session::s0");
  });

  it("forgets only the entry named, and is a no-op for one not listed", () => {
    const list = [session("a"), session("b")];
    expect(forgetClosed(list, session("a")).map(closedCellId)).toEqual(["session::b"]);
    expect(forgetClosed(list, session("zzz"))).toEqual(list);
  });
});

describe("reopenableClosed", () => {
  it("drops a conversation the grid has open again, and keeps shells", () => {
    const shell = shellEntry("/w");
    const list = [session("a"), session("b"), shell];
    expect(reopenableClosed(list, ["a"])).toEqual([session("b"), shell]);
    expect(reopenableClosed(list, [])).toEqual(list);
  });
});

describe("cellForClosed", () => {
  it("resumes a conversation as its agent on its login", () => {
    expect(cellForClosed(session("s1", { agent: "codex", account: "work" }))).toEqual({ session: "s1", cwd: "/w/app", agent: "codex", account: "work" });
    expect(cellForClosed(session("s1"))).toEqual({ session: "s1", cwd: "/w/app" });
  });

  it("opens a shell fresh in the same directory", () => {
    expect(cellForClosed(shellEntry("/w"))).toEqual(shellCell("/w"));
  });
});

describe("readClosedCells", () => {
  it("round-trips what was stored", () => {
    const list = [session("a", { agent: "codex", account: "work" }), shellEntry(null)];
    expect(readClosedCells(JSON.parse(JSON.stringify(list)))).toEqual(list);
  });

  it("reads anything that is not a list as empty", () => {
    [null, undefined, 1, "x", {}, { length: 1 }].forEach((value) => expect(readClosedCells(value)).toEqual([]));
  });

  it("drops malformed entries and keeps the rest", () => {
    const good = session("ok");
    const bad = [
      null,
      "x",
      { ...good, kind: "other" },
      { ...good, session: "" },
      { ...good, session: 1 },
      { ...good, agent: "vim" },
      { ...good, account: 3 },
      { ...good, cwd: 3 },
      { ...good, title: null },
      { ...good, closedAt: "now" },
      { ...good, closedAt: Number.NaN },
      { kind: "shell", cwd: "/w", title: "w" },
    ];
    expect(readClosedCells([...bad, good])).toEqual([good]);
  });

  it("keeps at most the cap", () => {
    const many = Array.from({ length: RECENTLY_CLOSED_MAX + 5 }, (_, i) => session(`s${i}`));
    expect(readClosedCells(many)).toHaveLength(RECENTLY_CLOSED_MAX);
  });
});
