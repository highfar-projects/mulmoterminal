// What an agent's OWN store calls a session — the value its history list already shows — so the
// cockpit roster's `summary` line has something to say for a cell that is not claude (#2123).
//
// Claude is not here, and the reason is the same one agent-badges.ts gives: its value comes from a
// different place entirely. Claude Code writes an `ai-title` into its own transcript, MulmoTerminal
// folds it out on the route it already runs, and it carries the `/clear` sentinel — none of which
// applies to another agent's store label. The caller falls back to this only when there is no
// `aiTitle`, so claude never reaches any of it.
//
// Why the OPENING of a conversation is the right thing to show beside claude's AI title, rather
// than a lesser stand-in for it: on the default title source claude's own title is written ONCE and
// never updated (header-title.ts, measured over 72 sessions), so that row is already "what this
// session was about near its beginning". These answer the same question from each agent's own
// records.
//
// What each store actually answers, which is NOT uniform and matters when reading a row:
//
//   codex     the first user prompt in the rollout, skipping the wrapper blocks codex writes into
//             a turn itself (environment_context and friends — codex-user-turn.ts owns that rule).
//   cursor    the first user message in the transcript, unwrapped from cursor's `<user_query>`.
//   copilot   copilot's OWN summary column — not a prompt, and REWRITTEN as the session goes, which
//             is the one value here that can change under a cached answer. Its store is ONE database
//             for the whole machine, so that read is scoped by cwd in the SQL; the other two are
//             scoped for free by where their file lives.
//
// grok, muse and antigravity are absent because none of them answers this for ONE id cheaply yet;
// their listings derive a title by reading a directory or a whole index. They report null, exactly
// as they already do for the roster's other two lines, so a row fills in as a whole or not at all.
import type { TerminalAgent } from "../../common/sessionAgent.js";
import { codexRollouts, codexRolloutsHydrated } from "../session/registry.js";
import { codexRolloutPath } from "./codex-sessions.js";
import { rememberBounded } from "./bounded-cache.js";
import { codexSessionsRoot } from "./codex-session.js";
import { codexUserPrompt } from "./codex-user-turn.js";
import { parseJsonRecord, readTranscriptHead } from "./transcript-head.js";
import { cursorSessionTitle } from "./cursor-sessions.js";
import { cursorHome } from "./cursor-hooks-file.js";
import { copilotSessionTitle } from "./copilot-sessions.js";

/** The same window the codex listing reads a title from, and for the reason recorded there: codex
 *  writes ~20 KB of session_meta and then a preamble before the first real prompt, so a smaller
 *  window lands short of it on every `codex exec` rollout and on 13% of interactive ones (#1777). */
const CODEX_HEAD_BYTES = 256 * 1024;

/** One line of roster chrome, so a title longer than the row can show is cut here rather than
 *  shipped in full to every poll. Generous enough that the clamp, not this, is what a reader
 *  notices. */
const TITLE_MAX = 200;

const trimmed = (value: string | null): string | null => {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  return text ? text.slice(0, TITLE_MAX) : null;
};

// Remembered because both cached readers answer from a record written ONCE — codex's first user
// prompt and cursor's first transcript line — so the answer cannot go stale, only absent, and the
// file being gone is already answered as null by the readers themselves.
//
// A MISS is never remembered, and that is the half that matters: a cell whose agent has not written
// its first turn yet is the ordinary state of a session someone has just started, and remembering
// "no title" would leave that row blank until the process restarted. It is the same failure
// `rolloutMeta` records twice in codex-sessions.ts.
const titleCache = new Map<string, string>();
// Bounded for codexRolloutPath's reason one file over: nothing prunes this, so without a cap a
// server running for weeks keeps one entry per session it ever rendered. The eviction itself is in
// bounded-cache.ts, where it can be proved without 512 fixtures.
export const TITLE_CACHE_MAX = 512;

/** How many titles are currently remembered. Exported for the spec that pins the bound. */
export const titleCacheSize = (): number => titleCache.size;

/** Drop every remembered title. For the specs, which point each agent's HOME at a fresh temp
 *  directory per case and would otherwise inherit the previous case's answer for a reused id. */
export const clearAgentTitleCache = (): void => titleCache.clear();

async function remembered(key: string, read: () => Promise<string | null>): Promise<string | null> {
  const hit = titleCache.get(key);
  if (hit !== undefined) return hit;
  const title = await read();
  if (title === null) return null; // never remember "nothing yet" — see the note above
  return rememberBounded(titleCache, key, title, TITLE_CACHE_MAX);
}

/** The first thing the PERSON said to this codex session, from the head of its rollout. */
async function codexTitle(sessionKey: string, root: string): Promise<string | null> {
  // The lookup codexBadges and codexLastTurn both make, awaited for their reason: the mapping is
  // read off disk, so a request served during startup would fall through to the key — a
  // mulmoterminal id, which names no rollout.
  await codexRolloutsHydrated;
  const rolloutId = codexRollouts.get(sessionKey)?.conversationId ?? sessionKey;
  const file = codexRolloutPath(root, rolloutId);
  if (!file) return null;
  const read = await readTranscriptHead(file, CODEX_HEAD_BYTES);
  if (!read) return null;
  for (const line of read.head.split("\n")) {
    const doc = parseJsonRecord(line);
    const prompt = doc === null ? null : codexUserPrompt(doc);
    if (prompt) return trimmed(prompt);
  }
  return null;
}

/** Where each agent keeps its sessions. Defaulted from the agent's own module and overridden only
 *  by the specs, which write a fixture into a temp directory — the same arrangement, and for the
 *  same reason, as `BadgeRoots` in agent-badges.ts. */
export interface TitleRoots {
  codexSessions?: string;
  /** cursor's HOME, not its projects directory: the slug a project is filed under cannot be
   *  reconstructed, so the reader walks from the home down (cursor-sessions.ts). */
  cursorHome?: string;
}

/**
 * What this agent's own store calls the session, or null when it has nothing to say yet.
 *
 * Claude is excluded in the TYPE rather than by a branch that returns null: its title is answered
 * from the fold the route already runs, and a caller reaching here for claude has made a mistake
 * the compiler should catch.
 */
export async function agentSessionTitle(cwd: string, id: string, agent: Exclude<TerminalAgent, "claude">, roots: TitleRoots = {}): Promise<string | null> {
  try {
    // The ROOT is part of every key: a spec points these at a temp store, and two stores holding
    // the same id must not answer for each other.
    if (agent === "codex") {
      const root = roots.codexSessions ?? codexSessionsRoot();
      return await remembered(`codex\0${root}\0${id}`, () => codexTitle(id, root));
    }
    // Keyed by cwd as well: cursor files a transcript under the project it was opened in, so the
    // same id in another directory is a different lookup.
    if (agent === "cursor") {
      const home = roots.cursorHome ?? cursorHome();
      return await remembered(`cursor\0${home}\0${cwd}\0${id}`, async () => trimmed(await cursorSessionTitle(cwd, id, home)));
    }
    // NOT remembered: copilot rewrites this summary as the session goes, so a cached answer would
    // pin the row to whatever it said the first time the roster looked.
    if (agent === "copilot") return trimmed(await copilotSessionTitle(id, cwd));
    // grok, muse and antigravity — stated as "no cheap per-id read yet" rather than as a list, so a
    // fourth reader is an addition above rather than a deletion here.
    return null;
  } catch {
    return null; // an unreadable store is a row with no summary, not a failed request
  }
}
