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
//   agy       the user's first prompt, unwrapped from the <USER_REQUEST> block agy wraps it in and
//             stripped of the metadata blocks it appends. Its transcript path is a plain join, so
//             this is the cheapest of the four — no scan at all.
//   grok      the first prompt in the cwd's prompt_history.jsonl for this id — the file interleaves
//             every conversation in the directory, so "first for this id" is what stands in for a
//             title, and a `!` line is a shell command rather than what the session is about.
//   muse      muse's OWN `title` column, from the index it keeps — not the `first_user_prompt`
//             beside it, because the rule here is what the agent's store CALLS the session.
//   copilot   copilot's OWN summary column — not a prompt, and REWRITTEN as the session goes, which
//             is the one value here that can change under a cached answer. Its store is ONE database
//             for the whole machine, so that read is scoped by cwd in the SQL; the other two are
//             scoped for free by where their file lives.
//
// Every agent MulmoTerminal hosts is now here. The two that answer from their own summary rather
// than the person's opening words — copilot and muse — are the two that are not cached.
import type { TerminalAgent } from "../../common/sessionAgent.js";
import { AGENT_TITLE_MAX } from "../../common/agentTitle.js";
import { codexRollouts, codexRolloutsHydrated } from "../session/registry.js";
import { codexRolloutPath } from "./codex-sessions.js";
import { rememberBounded } from "./bounded-cache.js";
import { codexSessionsRoot } from "./codex-session.js";
import { codexUserPrompt } from "./codex-user-turn.js";
import { parseJsonRecord, readTranscriptHead } from "./transcript-head.js";
import { cursorSessionTitle } from "./cursor-sessions.js";
import { antigravityPromptFromTranscriptHead, antigravityTranscriptPath } from "./antigravity-sessions.js";
import { antigravityBrainRoot, antigravityHome } from "./antigravity-session.js";
import { antigravityConversations, antigravityConversationsHydrated } from "../session/registry.js";
import { grokPromptTitles } from "./grok-sessions.js";
import { grokSessionsRoot } from "./grok-session.js";
import { museSessionTitle } from "./muse-session.js";
import { cursorHome } from "./cursor-hooks-file.js";
import { copilotSessionTitle } from "./copilot-sessions.js";

/** The same window the codex listing reads a title from, and for the reason recorded there: codex
 *  writes ~20 KB of session_meta and then a preamble before the first real prompt, so a smaller
 *  window lands short of it on every `codex exec` rollout and on 13% of interactive ones (#1777). */
const CODEX_HEAD_BYTES = 256 * 1024;

/** agy writes the first user turn as step 0, so the head is all a title needs — the same window its
 *  own listing reads one from. */
const ANTIGRAVITY_HEAD_BYTES = 64 * 1024;

// One line of roster chrome, so a title longer than the row can show is cut here rather than shipped
// in full to every poll. Generous enough that the clamp, not this, is what a reader notices. In
// `common/` because the client needs the same number to tell one of our truncations apart from a
// genuinely shorter title.

/** Carries "could not read" through the trim untouched — the readers that can fail say `undefined`
 *  and it has to survive all the way to the route. */
const orUnread = (value: string | null | undefined): string | null | undefined => (value === undefined ? undefined : trimmed(value));

const trimmed = (value: string | null): string | null => {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  return text ? text.slice(0, AGENT_TITLE_MAX) : null;
};

// Remembered because these readers answer from a record written ONCE — codex's first user prompt,
// cursor's first transcript line, agy's step 0 — so the answer cannot go stale, only absent, and the
// file being gone is already answered as null by the readers themselves. grok is the exception and
// says so at its own branch: its window can slide, and caching is what keeps the row still.
//
// THE KEY IS THE RESOLVED CONVERSATION, never the session key. codex and agy both file their
// transcript under an id of their own and ours is mapped to it, and that mapping MOVES: a cell
// relaunched or resumed onto a different rollout rewrites it. Keyed by our session id, the cache
// would keep answering with the conversation the key used to name — a real staleness Codex
// confirmed with the sequence (S→A cached, S remapped to B, cache still says A), and the reason the
// resolution happens above the cache rather than inside each reader.
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

/** The first thing the PERSON said to this codex session, from the head of its ROLLOUT — the
 *  resolved conversation, not the session key that pointed at it. */
async function codexTitle(rolloutId: string, root: string): Promise<string | null> {
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
  grokSessions?: string;
  /** agy's HOME, not its brain directory — `antigravityBrainRoot` is derived from it, the same way
   *  agent-badges.ts takes it. */
  antigravityHome?: string;
}

/** The user's first prompt to an agy conversation, from step 0 of its transcript — the resolved
 *  conversation, not the session key that pointed at it. */
async function antigravityTitle(conversationId: string, home: string): Promise<string | null> {
  const read = await readTranscriptHead(antigravityTranscriptPath(antigravityBrainRoot(home), conversationId), ANTIGRAVITY_HEAD_BYTES);
  return read ? trimmed(antigravityPromptFromTranscriptHead(read.head)) : null;
}

/**
 * What this agent's own store calls the session.
 *
 * THREE answers, and they are three different facts the wire already has room for:
 *   a string   the store calls it this
 *   null       the store was read and has nothing for this session — blank the row
 *   undefined  the store could NOT be read; say nothing, so the client keeps what it has
 *
 * The third is not fussiness. Serialising a failed read as "there is none" makes the roster erase a
 * summary that is perfectly correct, and for copilot and muse — the two that are never cached — a
 * momentarily locked sqlite file would do it on any poll (Codex, round 4).
 *
 * Claude is excluded in the TYPE rather than by a branch that returns null: its title is answered
 * from the fold the route already runs, and a caller reaching here for claude has made a mistake
 * the compiler should catch.
 */
export async function agentSessionTitle(
  cwd: string,
  id: string,
  agent: Exclude<TerminalAgent, "claude">,
  roots: TitleRoots = {},
): Promise<string | null | undefined> {
  try {
    // The ROOT is part of every key: a spec points these at a temp store, and two stores holding
    // the same id must not answer for each other.
    if (agent === "codex") {
      const root = roots.codexSessions ?? codexSessionsRoot();
      // Resolve BEFORE the cache is consulted, so the key names the rollout rather than the session
      // key pointing at it. The mapping is read off disk, so a request served during startup would
      // otherwise fall through to the key — a mulmoterminal id, which names no rollout.
      await codexRolloutsHydrated;
      const rolloutId = codexRollouts.get(id)?.conversationId ?? id;
      return await remembered(`codex\0${root}\0${rolloutId}`, () => codexTitle(rolloutId, root));
    }
    // Keyed by cwd as well: cursor files a transcript under the project it was opened in, so the
    // same id in another directory is a different lookup.
    if (agent === "cursor") {
      const home = roots.cursorHome ?? cursorHome();
      return await remembered(`cursor\0${home}\0${cwd}\0${id}`, async () => trimmed(await cursorSessionTitle(cwd, id, home)));
    }
    if (agent === "antigravity") {
      const home = roots.antigravityHome ?? antigravityHome();
      // Resolved before the cache, for codex's reason above. `?? id` covers a cell resumed straight
      // onto a conversation id, which is what the history list hands over.
      await antigravityConversationsHydrated;
      const conversationId = antigravityConversations.get(id)?.conversationId ?? id;
      return await remembered(`antigravity\0${home}\0${conversationId}`, () => antigravityTitle(conversationId, home));
    }
    // grok's file is one line per prompt with every conversation in the directory interleaved, so
    // this reads a bounded tail and picks this id's first.
    //
    // Remembered, but NOT for the reason the other three are. `grokPromptTitles` reads a 256 KB
    // TAIL, so what it can see as "first for this id" is the earliest SURVIVING line — and as the
    // directory's history grows, a conversation's real opening scrolls out of that window and the
    // answer drifts to a later prompt. Caching is what stops the roster's summary quietly changing
    // mid-session: it pins the earliest reading we ever got, which is also the closest to the true
    // first. The cost of being wrong is bounded the same way — a session first seen after its
    // opening had already scrolled away is pinned to a later prompt, which is what an uncached read
    // would have said anyway.
    if (agent === "grok") {
      const root = roots.grokSessions ?? grokSessionsRoot();
      return await remembered(`grok\0${root}\0${cwd}\0${id}`, async () => trimmed(grokPromptTitles(root, cwd).get(id) ?? null));
    }
    // NOT remembered, for copilot's reason: muse rewrites its title as the session goes.
    if (agent === "muse") return orUnread(await museSessionTitle(id, cwd));
    // NOT remembered: copilot rewrites this summary as the session goes, so a cached answer would
    // pin the row to whatever it said the first time the roster looked.
    if (agent === "copilot") return orUnread(await copilotSessionTitle(id, cwd));
    // Unreachable today — every TerminalAgent above answers. Kept because the union is what makes
    // an eighth agent a compile error at the spawn sites, not here, and a silent null is the wrong
    // way for this one to find out.
    return null;
  } catch {
    // A store that threw is one we could not read, NOT a session without a title. Reported as
    // "no answer" so the row keeps what it is showing rather than being erased by our own failure.
    return undefined;
  }
}
