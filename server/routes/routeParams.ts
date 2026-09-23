import { isTerminalAgent, type TerminalAgent } from "../../common/sessionAgent.js";
// Small query-param decisions shared by the terminal ws/session/dir routes, pulled out of
// the handlers so the parse rules live in one place (they were copied verbatim across three
// files, which is how they drift).
import type { Response } from "express";
import { workspaceRequest } from "../config/workspace.js";

// A non-negative integer index from a query param, or NaN for anything else — empty string,
// "-1", "1.5", "1e2", or a missing param. The anchored /^\d+$/ is deliberate: downstream
// resolveScript / canStartLauncher treat NaN as "no such index" and refuse, so a sloppy value
// must not slip through as some other number.
export function parseIndexParam(raw: string | null): number {
  return raw !== null && /^\d+$/.test(raw) ? Number(raw) : NaN;
}

// The agent a request selects, normalized. Only an exact match chooses a non-default agent;
// everything else — including "CODEX", "", null, an array, or a missing param — falls back to
// claude, the default backend. Case-sensitive on purpose: the query value comes straight from a
// URL, and a mis-cased "CODEX" starting Claude is safer than guessing the user meant codex.
//
// Derived from TERMINAL_AGENTS rather than listed again. It WAS listed again, and a sixth agent
// then reached five shared routes — header context, session detail, the prompts pane, last-turn
// handoff, the directory routes — normalized to "claude", reading another agent's files under its
// name. Its own `/ws/<agent>` endpoint and session listing hid it, because those are the paths the
// addition obviously touches (Codex review on #2063). A derived list cannot be forgotten.
export function normalizeAgent(raw: unknown): TerminalAgent {
  return typeof raw === "string" && isTerminalAgent(raw) ? raw : "claude";
}

// The directory a `?cwd=` route is to answer about, or null once it has answered the refusal
// itself — so a handler reads `if (cwd === null) return;` and is otherwise unchanged.
//
// A route that REPORTS ON a directory must not answer about a different one under the requested
// one's name (#1151): a stale preset, a mistyped path or one mangled in transit would otherwise
// come back as the default workspace's sessions, scripts, colours and git status. 404 rather than
// an empty 200, because "there is no such directory" and "that directory has nothing" are
// different answers and only one of them is worth telling the user about — an empty 200 is the
// silence this exists to end. A path that cannot name a directory at all is a malformed request.
export function workspaceForRoute(cwd: unknown, res: Response, ownDirectory?: string): string | null {
  const request = workspaceRequest(cwd);
  if (request.kind === "unusable") {
    res.status(request.malformed ? 400 : 404).json({ error: request.problem, cwd: request.requested });
    return null;
  }
  // A route that is ABOUT one session passes `ownDirectory` — that session's own working directory —
  // and a request naming no directory is then answered about it rather than about the default
  // workspace (#2133). A route that reports on a DIRECTORY passes nothing and keeps the default.
  //
  // The default was silently wrong for every session-scoped caller. The collection chat pane asks
  // about a filed chat and sends no `cwd` at all, so the route read a different project: measured on
  // this machine, a grok session answered its title under its own directory and nothing under the
  // default, and claude's on-disk prompt vanished the same way. The pane looked right only for a
  // session THIS process had spawned, because the live in-memory maps cover those whatever cwd is
  // asked about — which is why the hole survived: it is invisible in the case one tests by hand.
  //
  // Only `default` is redirected. An EXPLICIT `?cwd=` still wins, including one that disagrees with
  // where the session runs: a caller that named a directory is asking about that directory, and
  // #1151's rule — never answer about a different one under the requested one's name — holds here too.
  return request.kind === "default" && ownDirectory !== undefined ? ownDirectory : request.cwd;
}
