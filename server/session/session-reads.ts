// Reading sessions off disk: where Claude keeps a transcript, what one says, and the
// sidebar rows that fall out of it. Extracted from index.ts (#548) because the routes
// that serve this data cannot move until the readers do — every one of them would
// otherwise need the whole set injected.
//
// The readers touch the registry (a live in-memory title beats the on-disk one, and a
// row carries its session's activity flags), which is fine now that the registry is its
// own module: the dependency runs one way. One of them also WRITES — collectPendingSessions
// drops a session from knownSessions once disk has it — so "reads" describes the direction
// of the data, not a guarantee of purity.
import { existsSync, readdirSync } from "node:fs";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { isRecord } from "../../common/isRecord.js";
import {
  userPromptText,
  latestMeaningfulUserPromptFromParsed,
  latestAssistantTextFromParsed,
  timelineEventsIn,
  type SessionUsage,
  type LatestTurnContext,
  type TimelineEvent,
} from "./transcript.js";
import { createAppendFileCache, createFileCache, type AppendScan, type FileStamp } from "./file-cache.js";
import { createTranscriptSidecar } from "./transcript-sidecar.js";
import { classifyWorkPhase, type WorkPhase } from "./workPhase.js";
import { sessionListTitle } from "./sessionListTitle.js";
import { activity, aiTitles, codexRolloutIds, isBackgroundSession, isFailedWorker, knownSessions, sessionMemos } from "./registry.js";
import { projectSessionsDir } from "./project-dir.js";
import { lastTurnFromClaudeParsed, lastTurnFromCodexRolloutDocs, EMPTY_TURN, type LastTurn } from "./last-turn.js";
import { forEachJsonlRecord, forEachJsonlRecordIn, readTailRecords } from "../infra/jsonl-file.js";
import { createSummaryScan } from "./summary-scan.js";
import { partitionPending } from "./partitionPending.js";
import { codexSessionsRoot } from "../agents/codex-session.js";
import { codexRolloutPath } from "../agents/codex-sessions.js";
import type { DiskStat, PendingSession, SessionMeta } from "./types.js";
import { readString } from "../../common/readString.js";

// Bytes of an assistant reply kept for the roster; the same cap the push body uses.
export const LAST_RESPONSE_MAX = 400;

// The reply as it is on disk RIGHT NOW, or null when there is none to read. Separate from
// the cache below because the two want opposite things on failure: the roster would rather
// keep showing the last reply it had, while a push must never describe a finished turn with
// the PREVIOUS turn's text — for that caller, null has to stay null.
export function readLatestResponse(id: string, cwd: string): string | null {
  try {
    // The tail, not the file: a transcript reaches 585 MB, which readFile cannot hold at all —
    // and the newest reply is in the last few lines either way (#998).
    const text = latestAssistantTextFromParsed(readTailRecords(path.join(projectSessionsDir(cwd), `${id}.jsonl`)));
    return text ? text.slice(0, LAST_RESPONSE_MAX) : null;
  } catch {
    return null; // no transcript yet / unreadable
  }
}

// Whether a session has an on-disk transcript (claude only writes it after the
// first prompt) in the given workspace. Determines whether `--resume` will work.
export function sessionExistsOnDisk(id: string, cwd: string): boolean {
  return existsSync(path.join(projectSessionsDir(cwd), `${id}.jsonl`));
}

// readdirSync that yields [] instead of throwing on a missing / unreadable dir.
export function safeReaddir(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

// Every session id with a Claude transcript on disk, across ALL project dirs — so the
// orphan-tmux cleanup can tell a resumable session from a pure orphan (per-cwd
// sessionExistsOnDisk can't, since a tmux orphan carries no cwd). A non-dir entry under
// the projects root reads as empty, so it's harmlessly skipped.
export function claudeOnDiskSessionIds(): Set<string> {
  const ids = new Set<string>();
  const root = path.join(os.homedir(), ".claude", "projects");
  for (const project of safeReaddir(root)) {
    for (const f of safeReaddir(path.join(root, project))) {
      if (f.endsWith(".jsonl")) ids.add(f.slice(0, -".jsonl".length));
    }
  }
  return ids;
}

// The most recent user prompt from a resumed session's on-disk transcript, so a
// freshly-resumed cell can show its last prompt instead of just the id. null if
// there's no transcript yet (a never-prompted session) or it can't be read.
export async function latestUserPrompt(cwd: string, id: string): Promise<string | null> {
  try {
    return latestMeaningfulUserPromptFromParsed(readTailRecords(path.join(projectSessionsDir(cwd), `${id}.jsonl`)));
  } catch {
    return null;
  }
}

export const EMPTY_USAGE: SessionUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 };
export const EMPTY_CONTEXT: LatestTurnContext = { model: null, contextTokens: 0 };
export interface SessionSummary {
  lastPrompt: string | null;
  aiTitle: string | null;
  lastResponse: string | null;
  userTurns: number;
  usage: SessionUsage;
  context: LatestTurnContext;
  workPhase: WorkPhase | null;
}
export const EMPTY_SUMMARY: SessionSummary = {
  lastPrompt: null,
  aiTitle: null,
  lastResponse: null,
  userTurns: 0,
  usage: EMPTY_USAGE,
  context: EMPTY_CONTEXT,
  workPhase: null,
};

// Transcripts are append-only and can be hundreds of MB; /api/session/:id is hit on every
// window focus and by each grid cell as turns finish, so re-reading + re-parsing the whole
// .jsonl each time blocked the event loop and janked the terminals. Memoize by (mtime,size):
// an unchanged transcript returns instantly, and a changed one is read + parsed ONCE (the six
// derived values share one parse pass, vs. one parse per helper before).
const sessionSummaryCache = createFileCache<SessionSummary>();

export async function readSessionSummary(cwd: string, id: string): Promise<SessionSummary> {
  const file = path.join(projectSessionsDir(cwd), `${id}.jsonl`);
  let stamp: FileStamp;
  try {
    const st = await fs.stat(file);
    stamp = { mtimeMs: st.mtimeMs, size: st.size };
  } catch {
    return EMPTY_SUMMARY; // no transcript on disk yet
  }
  const cached = sessionSummaryCache.get(file, stamp);
  if (cached) return cached;
  // Streamed, never held: the transcript reaches 585 MB here, which is past what one string can
  // be — and reading it whole is what emptied the longest sessions (#998).
  const scan = createSummaryScan();
  try {
    await forEachJsonlRecord(file, (record) => scan.add(record));
  } catch {
    return EMPTY_SUMMARY;
  }
  const parts = scan.finish(LAST_RESPONSE_MAX);
  const summary: SessionSummary = {
    lastPrompt: parts.lastPrompt,
    aiTitle: parts.aiTitle,
    lastResponse: parts.lastResponse,
    userTurns: parts.userTurns,
    usage: parts.usage,
    context: parts.context,
    workPhase: classifyWorkPhase(parts.toolNames),
  };
  sessionSummaryCache.set(file, stamp, summary);
  return summary;
}

// The tool-activity timeline for a session, capped to the most recent events so the
// payload stays bounded on a long session. A missing transcript is an empty list.
const TIMELINE_MAX_EVENTS = 300;
export async function sessionTimeline(cwd: string, id: string): Promise<{ events: TimelineEvent[]; truncated: boolean }> {
  // Streamed, and only the newest TIMELINE_MAX_EVENTS are kept — the payload was already capped,
  // so holding the whole transcript to then throw most of it away was the expensive part (#998).
  const events: TimelineEvent[] = [];
  let total = 0;
  try {
    await forEachJsonlRecord(path.join(projectSessionsDir(cwd), `${id}.jsonl`), (record) => {
      for (const event of timelineEventsIn(record)) {
        total += 1;
        events.push(event);
        if (events.length > TIMELINE_MAX_EVENTS) events.shift();
      }
    });
  } catch {
    return { events: [], truncated: false };
  }
  return { events, truncated: total > TIMELINE_MAX_EVENTS };
}

// A session's last COMPLETED exchange, read from whichever log its agent keeps: Claude's
// per-project transcript, or codex's rollout. A codex session is addressed here by the
// mulmoterminal key the browser knows; the rollout it maps to is the one we recorded at
// spawn, or the key itself when it came from the sidebar (which lists rollout ids).
async function codexLastTurn(sessionKey: string): Promise<LastTurn> {
  const rolloutId = codexRolloutIds.get(sessionKey) ?? sessionKey;
  const file = codexRolloutPath(codexSessionsRoot(), rolloutId);
  if (!file) return EMPTY_TURN;
  try {
    // Same reasoning as the Claude path below: the newest turn is at the end, so a rollout that
    // grew past what a string can hold no longer takes the feature with it (#998).
    return lastTurnFromCodexRolloutDocs(readTailRecords(file));
  } catch {
    return EMPTY_TURN;
  }
}

// The tail, not the whole file — which is what #865 said the fix would be and #998 forced.
//
// Reading it whole cost its full size: measured over 10,506 real transcripts the median is 0.1 MB,
// but 13 exceed 100 MB, the largest is 585 MB, and a 440 MB one took 1930 ms to yield a
// 334-character reply — 1.9 seconds with the event loop stopped, every terminal in the app frozen.
// Past ~512 MB the read could not complete at all (V8's maximum string length), so the button did
// nothing. The last turn is in the last few lines either way, so the size of the file behind it
// stopped mattering: the same read now costs 256 KB whatever the transcript weighs. There is
// consequently no size limit here at all, and no "too large" answer for a caller to handle.

export async function sessionLastTurn(cwd: string, id: string, agent: "claude" | "codex" | "antigravity"): Promise<LastTurn> {
  if (agent === "codex") return codexLastTurn(id);
  if (agent === "antigravity") return EMPTY_TURN;
  try {
    return lastTurnFromClaudeParsed(readTailRecords(path.join(projectSessionsDir(cwd), `${id}.jsonl`)));
  } catch {
    return EMPTY_TURN; // no transcript on disk yet
  }
}

// The three fields the session list needs OFF DISK. Cached; everything else on a row (the memo, the
// live ai-title, the activity flags) is read per request from memory, because those change while
// the file does not — caching the finished row would freeze an edited memo behind it.
interface TitleFields {
  aiTitle: string | null;
  lastPrompt: string | null;
  firstUserMsg: string | null;
}

const NO_TITLE_FIELDS: TitleFields = { aiTitle: null, lastPrompt: null, firstUserMsg: null };

// The rule, in one place, so the whole-file read and the resumed one cannot drift apart: the LAST
// ai-title / last-prompt win, the FIRST user message does.
function foldTitleField(into: TitleFields, o: Record<string, unknown>): void {
  if (o.type === "ai-title" && o.aiTitle) into.aiTitle = readString(o.aiTitle);
  else if (o.type === "last-prompt" && o.lastPrompt) into.lastPrompt = readString(o.lastPrompt);
  else if (o.type === "user" && into.firstUserMsg === null) {
    into.firstUserMsg = userPromptText(isRecord(o.message) ? o.message.content : undefined);
  }
}

// Windows for the cold read, measured over the 60 largest transcripts on a working machine (5 MB to
// 508 MB, each read end to end): the first `user` record sat at most 26.6 KB in, and the last
// ai-title / last-prompt at most 52.8 KB from EOF. Both windows are ~10x that, and a file whose
// fields fall outside them is not guessed at — it is read whole (see readTitleFields).
const TITLE_HEAD_BYTES = 256 * 1024;
const TITLE_TAIL_BYTES = 512 * 1024;

const titleFieldsCache = createAppendFileCache<TitleFields>();

// The same fold, kept on disk for the transcripts big enough to be worth a file — so a restart and
// the next mulmoterminal process do not each pay for it again (#1386). Bump the version when
// foldTitleField changes what it means, or old files answer for a rule that no longer exists.
const isTitleFields = (value: unknown): value is TitleFields =>
  isRecord(value) &&
  (value.aiTitle === null || typeof value.aiTitle === "string") &&
  (value.lastPrompt === null || typeof value.lastPrompt === "string") &&
  (value.firstUserMsg === null || typeof value.firstUserMsg === "string");

const titleFieldsSidecar = createTranscriptSidecar<TitleFields>({ kind: "title-fields", version: 1, isValue: isTitleFields });

// A transcript is append-only, so the same three fields are folded out of it at most once: an
// unchanged file is not read at all, and a grown one costs only the bytes that arrived. Without
// this the session list read every one of its fifty transcripts in full on every request — 4.8 s
// for a 17 KB answer on a 1.1 GB project, and the launcher waits on it (#1377).
async function readTitleFields(full: string, stamp: FileStamp): Promise<TitleFields> {
  // Memory first, disk second: the sidecar only has to answer the first read of a file in this
  // process, and after that the in-memory scan is the one being resumed.
  const resumed = titleFieldsCache.resume(full, stamp) ?? (await titleFieldsSidecar.read(full, stamp));
  if (resumed && resumed.from >= stamp.size) {
    titleFieldsCache.set(full, stamp, resumed.from, resumed.value);
    return resumed.value;
  }
  const { fields, offset } = resumed
    ? // Resuming from a boundary the previous scan reported, so the record starting there counts.
      await resumeTitleFields(full, resumed)
    : await coldTitleFields(full, stamp.size);
  titleFieldsCache.set(full, stamp, offset, fields);
  titleFieldsSidecar.write(full, stamp, offset, fields);
  return fields;
}

async function resumeTitleFields(full: string, resumed: AppendScan<TitleFields>): Promise<{ fields: TitleFields; offset: number }> {
  const fields = { ...resumed.value };
  const offset = await forEachJsonlRecordIn(full, { from: resumed.from, atLineStart: true }, (o) => foldTitleField(fields, o));
  return { fields, offset };
}

// The first read of a file: both ends when it is big enough for that to be worth it, and the whole
// file when it is not — or when the ends did not answer. A field missing from a window is
// indistinguishable from a field the file never had, so the windows are a fast path, never the
// answer: only when all three are found is the fold provably the same as the whole-file one (the
// tail runs to EOF, so an ai-title found there IS the last one).
//
// The offset comes back with the fields, and it is the end of the last COMPLETE line rather than
// the file's size: a transcript caught mid-append ends in half a record, and resuming past it would
// start the next scan inside a line — losing the record that half line becomes.
async function coldTitleFields(full: string, size: number): Promise<{ fields: TitleFields; offset: number }> {
  if (size > TITLE_HEAD_BYTES + TITLE_TAIL_BYTES) {
    const head: TitleFields = { ...NO_TITLE_FIELDS };
    const tail: TitleFields = { ...NO_TITLE_FIELDS };
    await forEachJsonlRecordIn(full, { to: TITLE_HEAD_BYTES }, (o) => foldTitleField(head, o));
    const offset = await forEachJsonlRecordIn(full, { from: size - TITLE_TAIL_BYTES }, (o) => foldTitleField(tail, o));
    if (head.firstUserMsg !== null && tail.aiTitle !== null && tail.lastPrompt !== null) {
      return { fields: { aiTitle: tail.aiTitle, lastPrompt: tail.lastPrompt, firstUserMsg: head.firstUserMsg }, offset };
    }
  }
  const whole: TitleFields = { ...NO_TITLE_FIELDS };
  const offset = await forEachJsonlRecordIn(full, {}, (o) => foldTitleField(whole, o));
  return { fields: whole, offset };
}

export async function readSessionMeta(dir: string, file: string): Promise<SessionMeta> {
  const full = path.join(dir, file);
  const stat = await fs.stat(full);
  const { aiTitle, lastPrompt, firstUserMsg } = await readTitleFields(full, { mtimeMs: stat.mtimeMs, size: stat.size });

  const id = path.basename(file, ".jsonl");
  const title = sessionListTitle({ memo: sessionMemos.get(id), liveAiTitle: aiTitles.get(id), diskAiTitle: aiTitle, diskLastPrompt: lastPrompt, firstUserMsg });
  const a = activity.get(id);
  return {
    id,
    title,
    mtime: stat.mtimeMs,
    working: a?.working ?? false,
    waiting: a?.waiting ?? false,
    event: a?.event ?? null,
    hidden: isBackgroundSession(id),
    failed: isFailedWorker(id),
  };
}

// Cheap recency pass: stat (don't read) every session file just for its mtime, so the
// list can be ranked by recency. Files that vanished between readdir and stat are skipped.
export async function collectOnDiskSessionStats(dir: string, files: string[]): Promise<DiskStat[]> {
  const stats = await Promise.all(
    files.map(async (file): Promise<DiskStat | null> => {
      try {
        const st = await fs.stat(path.join(dir, file));
        return { kind: "disk", id: path.basename(file, ".jsonl"), file, mtime: st.mtimeMs };
      } catch {
        return null;
      }
    }),
  );
  return stats.filter((s): s is DiskStat => s !== null);
}

// In-memory sessions not yet written to disk. Prune (delete from knownSessions) any that
// have since been persisted — the on-disk record (with its real title) wins.
export function collectPendingSessions(onDisk: Set<string>, includePending: boolean): PendingSession[] {
  const known = includePending ? knownSessions : [];
  const { keep, persisted } = partitionPending(
    known,
    onDisk,
    (id) => activity.get(id),
    (id) => isBackgroundSession(id),
  );
  persisted.forEach((id) => knownSessions.delete(id));
  return keep;
}
