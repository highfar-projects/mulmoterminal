// Which SESSION a GUI MCP bridge process belongs to, when nothing told it.
//
// Every other host hands the answer over: claude and codex get a session-scoped URL at spawn, and
// agy and grok read a config file whose server entry the session's own environment completes
// (guiMcpEnv — the bridge is their child, so it inherits it).
//
// muse breaks that, and it is not a detail that can be worked around at the call site: a plugin's
// MCP server is started with a CURATED ENVIRONMENT — measured at 16 variables, all of them muse's
// own (MUSE_PLUGIN_ROOT, PATH, HOME, TMPDIR …) — and neither the muse process's environment nor
// the manifest's own `env` block reaches it. So the bridge starts knowing its group and its port
// (both are argv, which IS ours) and nothing at all about the session.
//
// Two things do survive, and between them they answer it:
//
//   THE PROCESS TREE. The bridge is a descendant of the muse process, which is the root process of
//   the tmux pane whose session name is the session id this server minted. `tmux list-panes` maps
//   that pane pid to that name, so walking up from the bridge until a pane pid is hit is exact —
//   it distinguishes two muse cells in ONE directory, which nothing else here can.
//
//   THE WORKING DIRECTORY. The bridge inherits the workspace as its cwd. That is the fallback for
//   a session that is not in tmux (persistence off), and it is only trusted when it names exactly
//   one live muse session: two cells in one directory would otherwise send one cell's chart to the
//   other, which is worse than no chart.
import { ptys } from "./registry.js";
import type { ToolGroup } from "../../common/toolGroups.js";

/** What the resolver needs to know about the world, so the rule itself is pure and testable. */
export interface BridgeSessionFacts {
  /** Pane root pid -> session id, from tmux. */
  panePids: ReadonlyMap<number, string>;
  /** The ancestors of the bridge, nearest first, INCLUDING its own pid. */
  ancestors: readonly number[];
  /** Live sessions running muse, as id -> cwd. */
  museSessions: ReadonlyMap<string, string>;
  /** The bridge's working directory. */
  cwd: string;
}

/**
 * The session a bridge belongs to, or null when it cannot be known for certain.
 *
 * Null is a real answer and the important one: it means the bridge serves NO tools rather than
 * some other session's. An ambiguous directory is the case that makes this worth stating —
 * answering "probably that one" would put a chart in the wrong cell, and a missing chart is the
 * failure a user can see and report.
 */
export function resolveBridgeSession(facts: BridgeSessionFacts): string | null {
  for (const pid of facts.ancestors) {
    const session = facts.panePids.get(pid);
    if (session && facts.museSessions.has(session)) return session;
  }
  const inCwd = [...facts.museSessions].filter(([, cwd]) => cwd === facts.cwd);
  return inCwd.length === 1 ? (inCwd[0]?.[0] ?? null) : null;
}

// ── the groups half ───────────────────────────────────────────────────────────────────────────
//
// Once the session is known, what may it reach? For agy and grok that question is already answered
// by the file the agent read; muse's plugin is installed for the MACHINE and declares every group,
// so the answer has to come from here — recorded at spawn, when the directory's registration was
// read, and read back by the resolve route.
//
// In memory only, and deliberately: it describes a RUNNING session, so a server restart that
// forgets it has also lost the pty it describes. The entry is dropped when the session ends.
const groupsBySession = new Map<string, readonly ToolGroup[]>();

export function rememberEntitledToolGroups(sessionId: string, groups: readonly ToolGroup[]): void {
  groupsBySession.set(sessionId, [...groups]);
}

export function forgetEntitledToolGroups(sessionId: string): void {
  groupsBySession.delete(sessionId);
}

/** What this session may reach. Named for ENTITLEMENT, not to be confused with registry's
 *  `sessionToolGroups`, which records what a session has been OBSERVED reaching — that one is
 *  learned from connections and drives the Canvas gate; this one is decided at spawn and drives
 *  what a bridge is allowed to serve.
 *
 *  An unknown session answers NOTHING rather than everything: a bridge asking about a session we
 *  have no record of is a bridge we cannot vouch for. */
export const entitledToolGroups = (sessionId: string): readonly ToolGroup[] => groupsBySession.get(sessionId) ?? [];

/** The live muse sessions and where each runs — the world the rule above is applied to.
 *
 *  muse-only on purpose: the other hosts are TOLD their session, and a process tree is a weaker
 *  claim than being told. Widening this would let a bridge that lost its environment claim a
 *  claude session by standing near it.  */
export function liveMuseSessions(): Map<string, string> {
  const sessions = new Map<string, string>();
  for (const [id, entry] of ptys) if (entry.agent === "muse") sessions.set(id, entry.cwd);
  return sessions;
}
