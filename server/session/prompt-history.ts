// The prompts the USER typed at a session, newest last — the other half of the activity
// timeline, which records what the agent ran rather than what it was asked for.
//
// Read from the log that holds what a person actually typed, which for claude is NOT its
// transcript. Measured on a real session (#1748): a prompt sent WHILE a turn was running is
// written to ~/.claude/history.jsonl within milliseconds but never appears in the transcript as a
// `type:"user"` record — it arrives as `queue-operation` / `attachment` — while the text a skill
// injects DOES appear there as a user record, and is not matched by isInjectedPrompt. So the
// transcript drops the interruptions (the very prompts a user forgets giving) and adds text nobody
// typed. history.jsonl carries one line per submission, and nothing else.
//
// Pure: the reading and the agent branch live in session-reads.ts.
import { isRecord } from "../../common/isRecord.js";
import { readString } from "../../common/readString.js";
import type { PromptEntry, PromptWindow } from "../../common/promptHistory.js";
import { codexEventPayload } from "../agents/codex-events.js";
import { userPromptText } from "./transcript.js";

/** Enough to recognise a prompt again, which is what this is for. Deliberately far above
 *  LAST_PROMPT_CAP (200): that one keeps a header to one line, this one is read back. */
export const PROMPT_TEXT_CAP = 1000;

/** How many the pane is served. The ask was "10, maybe 20"; the rest is scrollback. */
export const PROMPT_HISTORY_MAX = 100;

/** What a READER should ask for: one over the window, so overflow is a fact rather than an
 *  inference. Cap at exactly PROMPT_HISTORY_MAX and a session with precisely that many prompts is
 *  indistinguishable from one that had a thousand — and the pane would tell a complete list that
 *  its older prompts are missing (Codex, #1749). */
export const PROMPT_SCAN_LIMIT = PROMPT_HISTORY_MAX + 1;

/** The served window, from what a reader collected at PROMPT_SCAN_LIMIT. */
export const promptWindow = (found: PromptEntry[]): PromptWindow => ({
  prompts: found.slice(-PROMPT_HISTORY_MAX),
  truncated: found.length > PROMPT_HISTORY_MAX,
});

const cap = (text: string): string => (text.length > PROMPT_TEXT_CAP ? `${text.slice(0, PROMPT_TEXT_CAP)}…` : text);

// Trivial acks ("ok", "はい") are kept. isTrivialPrompt also calls "merge" / "続けて" trivial —
// correct for a header, which wants the task, and wrong here, where those ARE the instruction.
const entry = (at: number | null, text: unknown): PromptEntry | null => {
  const body = readString(text).trim();
  return body ? { at, text: cap(body) } : null;
};

/** Epoch ms from either shape the two logs use: claude's number, codex's ISO string. */
function epochMs(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return null;
}

/** One ~/.claude/history.jsonl line: `{display, timestamp, project, sessionId}`. The session id is
 *  required — it is what scopes the file to one cell — and a record without it is dropped rather
 *  than shown under whichever session happens to be asking. */
export function claudeHistoryPrompt(record: Record<string, unknown>): { sessionId: string; prompt: PromptEntry } | null {
  const sessionId = readString(record.sessionId);
  if (!sessionId) return null;
  const prompt = entry(epochMs(record.timestamp), record.display);
  return prompt ? { sessionId, prompt } : null;
}

// The three readers below differ only in which records they recognise; keeping the WINDOW in one
// place is what makes "oldest first, newest `limit` kept" the same answer for every log.
const collect = (records: Record<string, unknown>[], read: (record: Record<string, unknown>) => PromptEntry | null, limit: number): PromptEntry[] =>
  records.flatMap((record) => read(record) ?? []).slice(-limit);

/** Every claude id seen for a session so far, with `id` added if it is new. Oldest first.
 *
 *  A LIST, not the latest: claude reissues its id on each `/compact`, and a long session compacts
 *  repeatedly (auto-compact), so keeping only the newest loses every prompt from before the
 *  previous compaction — the older half of exactly the history this pane exists to show
 *  (Codex, #1749). */
export const withClaudeId = (seen: readonly string[], id: string): string[] => (seen.includes(id) ? [...seen] : [...seen, id]);

/** Which ids the history file has to be read under, for a session this app calls `ourId`.
 *
 *  Claude reissues its OWN session id on `/clear` and `/compact` and goes on reporting to us under
 *  ours (activity-hook.ts) — so history.jsonl, which keys on claude's, stops matching. Without
 *  this, a compacted session's pane freezes at the compaction and a cleared one never moves again.
 *
 *  `/compact` continues the SAME conversation, so ours and every id since are all its prompts.
 *  `/clear` ends one, and the repo's rule is that the ended conversation does not come back
 *  (#1085): the caller empties the list at the clear, so what remains is the new conversation's
 *  alone — and until its first hook there is nothing to show, which is the honest answer rather
 *  than the ended conversation's prompts. */
export function historyIdsFor(ourId: string, claudeIds: readonly string[] | undefined, cleared: boolean): string[] {
  const seen = claudeIds ?? [];
  if (cleared) return seen.filter((id) => id !== ourId);
  return seen.includes(ourId) ? [...seen] : [ourId, ...seen];
}

/** These ids' prompts, oldest first, capped to the newest `limit`. Several ids are ONE session
 *  whose id was reissued mid-conversation, so the rows interleave in file order — which is time
 *  order, since the file is only ever appended to.
 *
 *  A Set rather than `includes`: a much-compacted session carries a whole chain of ids, and this
 *  runs per record over a file with tens of thousands of them. */
export function claudePromptsFor(records: Record<string, unknown>[], sessionIds: readonly string[], limit: number = PROMPT_HISTORY_MAX): PromptEntry[] {
  const wanted = new Set(sessionIds);
  return collect(
    records,
    (record) => {
      const read = claudeHistoryPrompt(record);
      return read && wanted.has(read.sessionId) ? read.prompt : null;
    },
    limit,
  );
}

/** codex has no history file and no hooks, so its rollout is the only record of a prompt. The
 *  `user_message` events are the ones a person sent: measured over 40 real rollouts, none of them
 *  carried injected text (codex files its environment context under other payload types). */
export const codexPrompts = (records: Record<string, unknown>[], limit: number = PROMPT_HISTORY_MAX): PromptEntry[] =>
  collect(
    records,
    (record) => {
      const payload = codexEventPayload(record, "user_message");
      return payload ? entry(epochMs(record.timestamp), payload.message) : null;
    },
    limit,
  );

/** The transcript fallback, so a history.jsonl this cannot read — a format change upstream, or a
 *  session claude wrote before that file existed — leaves the pane with SOMETHING rather than
 *  silently empty. Worse than the real thing by construction (it is missing the interruptions and
 *  carries injected text that `userPromptText` does not recognise), which is why it is the
 *  fallback and not the source. */
export const transcriptPrompts = (records: Record<string, unknown>[], limit: number = PROMPT_HISTORY_MAX): PromptEntry[] =>
  collect(
    records,
    (record) => {
      if (record.type !== "user" || !isRecord(record.message)) return null;
      const text = userPromptText(record.message.content);
      return text === null ? null : entry(epochMs(record.timestamp), text);
    },
    limit,
  );
