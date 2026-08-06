// @vitest-environment node
//
// Which session a GUI MCP bridge belongs to when nothing told it — the rule muse forces, because a
// plugin's MCP server is started with a curated environment carrying none of ours.
//
// The two failure modes this exists to keep apart: answering the WRONG session (one cell's chart
// drawn in another) and answering NOTHING (no chart). The second is the one to prefer, because it
// is the one a user can see and report.
import { describe, it, expect } from "vitest";
import { resolveBridgeSession } from "../../../server/session/bridge-session.js";
import { ancestorPids } from "../../../server/infra/process-tree.js";

const A = "aaaaaaaa-1111-4111-8111-111111111111";
const B = "bbbbbbbb-2222-4222-8222-222222222222";
const CWD = "/home/me/project";

describe("resolveBridgeSession", () => {
  // The measured shape: bridge (2244) -> muse (2220) -> tmux, where 2220 is the pane pid tmux
  // reports for the session named by our own id.
  it("follows the process tree to the pane it is running under", () => {
    const session = resolveBridgeSession({
      panePids: new Map([[2220, A]]),
      ancestors: [2244, 2220, 15746],
      museSessions: new Map([[A, CWD]]),
      cwd: CWD,
    });
    expect(session).toBe(A);
  });

  // The point of walking the TREE rather than matching the directory: two muse cells opened in one
  // directory are indistinguishable by cwd, and this is what tells them apart.
  it("tells two sessions in one directory apart", () => {
    const facts = {
      panePids: new Map([
        [100, A],
        [200, B],
      ]),
      museSessions: new Map([
        [A, CWD],
        [B, CWD],
      ]),
      cwd: CWD,
    };
    expect(resolveBridgeSession({ ...facts, ancestors: [300, 200] })).toBe(B);
    expect(resolveBridgeSession({ ...facts, ancestors: [301, 100] })).toBe(A);
  });

  // Persistence off, or a pane tmux no longer reports: the directory answers, but only when it
  // cannot be wrong.
  it("falls back to the directory when exactly one muse session runs there", () => {
    const session = resolveBridgeSession({ panePids: new Map(), ancestors: [999], museSessions: new Map([[A, CWD]]), cwd: CWD });
    expect(session).toBe(A);
  });

  it("refuses to guess when two muse sessions share the directory", () => {
    const session = resolveBridgeSession({
      panePids: new Map(),
      ancestors: [999],
      museSessions: new Map([
        [A, CWD],
        [B, CWD],
      ]),
      cwd: CWD,
    });
    expect(session).toBeNull();
  });

  it("answers nothing for a directory no muse session is running in", () => {
    expect(resolveBridgeSession({ panePids: new Map(), ancestors: [999], museSessions: new Map([[A, "/elsewhere"]]), cwd: CWD })).toBeNull();
  });

  // A pane whose session is not a LIVE muse — it ended, or it is a claude cell — must not be
  // claimed by a bridge that happens to sit under it.
  it("ignores a pane whose session is not a live muse session", () => {
    const session = resolveBridgeSession({ panePids: new Map([[2220, "some-claude-session"]]), ancestors: [2244, 2220], museSessions: new Map(), cwd: CWD });
    expect(session).toBeNull();
  });

  // The tree wins over the directory, which is what makes the fallback safe to have at all.
  it("prefers the pane over the directory when both could answer", () => {
    const session = resolveBridgeSession({
      panePids: new Map([[2220, B]]),
      ancestors: [2244, 2220],
      museSessions: new Map([
        [A, CWD],
        [B, "/elsewhere"],
      ]),
      cwd: CWD,
    });
    expect(session).toBe(B);
  });
});

describe("ancestorPids", () => {
  it("walks from the process up to the root, nearest first", () => {
    const parents = new Map([
      [10, 9],
      [9, 8],
      [8, 1],
    ]);
    expect(ancestorPids(10, (pid) => parents.get(pid) ?? null)).toEqual([10, 9, 8]);
  });

  it("stops at a pid `ps` cannot answer for", () => {
    expect(ancestorPids(10, () => null)).toEqual([10]);
  });

  // A cycle should be impossible, but a walk that trusts `ps` completely would hang the request
  // that started it — and this one runs inside an HTTP handler.
  it("does not spin on a cycle", () => {
    const parents = new Map([
      [10, 11],
      [11, 10],
    ]);
    expect(ancestorPids(10, (pid) => parents.get(pid) ?? null)).toEqual([10, 11]);
  });

  it("is bounded for a very deep tree", () => {
    expect(ancestorPids(1000, (pid) => pid + 1)).toHaveLength(8);
  });
});
