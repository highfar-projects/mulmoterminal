// What a process outside MulmoTerminal may ask of a session it did not start (plans/feat-external-ask.md):
// who may call, which sessions it may address, what a send looks like, and which finished turn is
// the answer to it. Pure — the route hands in the settings, the session's facts and its turns.
//
// FORK-ONLY. Upstream has no counterpart, and MulmoClaude has none either: the caller is a local
// program (a secretary bot), not an agent, so it is neither the sendToSession tool (which only
// reaches sessions the CALLER started) nor the board's reply box (which has no caller to name).
import path from "node:path";
import { timingSafeEqual } from "node:crypto";
import { isRecord } from "../../common/isRecord.js";
import { sanitizeTerminalInput } from "../backends/remoteHost/terminalInput.js";
import { SEND_MAX_CHARS } from "./sessionAsk.js";
import { completedCount, type RelayTurn } from "../session/transcript/relay-range.js";
import type { LastTurn } from "../session/transcript/last-turn.js";

export interface ExternalAskSettings {
  enabled: boolean;
  /** Sessions whose working directory is one of these, or inside one, may be addressed. */
  allowDirs: string[];
  /** The word in the tag appended to every send, so the screen and the log say who sent it. */
  label: string;
}

export const DEFAULT_LABEL = "external";
const LABEL_RE = /^[a-z][a-z0-9-]{0,15}$/;

/** The settings file, or "off" for anything it does not say plainly. */
export function parseExternalAskSettings(value: unknown): ExternalAskSettings {
  if (!isRecord(value)) return { enabled: false, allowDirs: [], label: DEFAULT_LABEL };
  const allowDirs = Array.isArray(value.allowDirs)
    ? value.allowDirs.filter((dir): dir is string => typeof dir === "string" && dir.trim() !== "" && path.isAbsolute(dir.trim())).map((dir) => dir.trim())
    : [];
  const label = typeof value.label === "string" && LABEL_RE.test(value.label) ? value.label : DEFAULT_LABEL;
  return { enabled: value.enabled === true, allowDirs, label };
}

/** A directory spelled the way two spellings of it compare equal. Windows paths ignore case and
 *  take either slash; a trailing separator says nothing. */
export function comparableDir(dir: string, platform: NodeJS.Platform = process.platform): string {
  const p = platform === "win32" ? path.win32 : path.posix;
  const resolved = p.resolve(dir);
  const rootLength = p.parse(resolved).root.length;
  let end = resolved.length;
  while (end > rootLength && (resolved[end - 1] === "/" || resolved[end - 1] === "\\")) end -= 1;
  const trimmed = resolved.slice(0, end);
  return platform === "win32" ? trimmed.toLowerCase() : trimmed;
}

export const sameDir = (a: string, b: string, platform: NodeJS.Platform = process.platform): boolean =>
  comparableDir(a, platform) === comparableDir(b, platform);

/** The directory is one the settings name, or inside one. */
export function dirAllowed(cwd: string, allowDirs: readonly string[], platform: NodeJS.Platform = process.platform): boolean {
  if (!cwd) return false;
  const sep = platform === "win32" ? "\\" : "/";
  const target = comparableDir(cwd, platform);
  return allowDirs.some((dir) => {
    const allowed = comparableDir(dir, platform);
    return target === allowed || target.startsWith(allowed.endsWith(sep) ? allowed : `${allowed}${sep}`);
  });
}

/** The bearer token matches, compared in constant time. */
export function tokenMatches(authorization: string | undefined, token: string): boolean {
  if (!authorization || !token) return false;
  const match = /^Bearer\s+(\S+)$/i.exec(authorization.trim());
  if (!match?.[1]) return false;
  const given = Buffer.from(match[1]);
  const expected = Buffer.from(token);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export const ASK_ID_RE = /^[0-9a-f]{12}$/;

/** Appended to the text, and the only thing the answer is found by. It is on the screen and in the
 *  transcript, so it is also what says the line was not typed by the user. */
export const externalAskTag = (label: string, askId: string): string => ` [${label} ${askId}]`;

const TAG_TAIL = (askId: string): RegExp => new RegExp(`\\[[a-z][a-z0-9-]* ${askId}\\]`);

/** This prompt carries the tag of `askId`, whatever label sent it. */
export const promptCarries = (prompt: string | null, askId: string): boolean => prompt !== null && TAG_TAIL(askId).test(prompt);

export type ErrorCode =
  | "unauthorized"
  | "disabled"
  | "origin-not-allowed"
  | "target-not-allowed"
  | "invalid-request"
  | "no-session"
  | "target-changed"
  | "unsupported-agent"
  | "question-open"
  | "permission-pending"
  | "busy"
  | "typed-not-submitted"
  | "text-too-long"
  | "session-ended"
  | "conversation-cleared"
  | "send-failed"
  | "read-failed";

export const STATUS_OF: Record<ErrorCode, number> = {
  unauthorized: 401,
  disabled: 403,
  "origin-not-allowed": 403,
  "target-not-allowed": 403,
  "invalid-request": 400,
  "no-session": 404,
  "target-changed": 409,
  "unsupported-agent": 422,
  "question-open": 409,
  "permission-pending": 409,
  busy: 409,
  "typed-not-submitted": 409,
  "text-too-long": 413,
  "session-ended": 410,
  "conversation-cleared": 410,
  "send-failed": 502,
  "read-failed": 500,
};

export interface AskRequest {
  text: string;
  expectCwd: string;
}

export type Parsed<T> = ({ ok: true } & T) | { ok: false; code: ErrorCode; message: string };

/** The text to type and the directory the caller believes the session is in. */
export function parseAskRequest(body: unknown): Parsed<AskRequest> {
  const record = isRecord(body) ? body : {};
  const raw = typeof record.text === "string" ? record.text : "";
  const text = sanitizeTerminalInput(raw);
  if (text === "") return { ok: false, code: "invalid-request", message: "`text` is required: the request to type into the session." };
  if (text.length > SEND_MAX_CHARS) return { ok: false, code: "text-too-long", message: `\`text\` is longer than ${SEND_MAX_CHARS} characters.` };
  const expectCwd = typeof record.expectCwd === "string" ? record.expectCwd.trim() : "";
  if (expectCwd === "" || !path.isAbsolute(expectCwd))
    return { ok: false, code: "invalid-request", message: "`expectCwd` is required: the absolute working directory you expect the session to be in." };
  return { ok: true, text, expectCwd };
}

export const DEFAULT_WAIT_SECONDS = 30;
export const MAX_WAIT_SECONDS = 120;
const MS_PER_SECOND = 1000;

/** `?waitSeconds=` in ms: absent or unreadable is the default, 0 is "answer now", the rest is clamped. */
export function waitMsOf(value: unknown): number {
  const seconds = typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  if (!Number.isFinite(seconds)) return DEFAULT_WAIT_SECONDS * MS_PER_SECOND;
  return Math.min(Math.max(seconds, 0), MAX_WAIT_SECONDS) * MS_PER_SECOND;
}

export type AnswerState = { status: "answered"; reply: string } | { status: "pending"; seen: boolean };

/**
 * Whether the turn our tagged text started has finished, and what it ended with.
 *
 * The last completed turn is asked first: its reply is the one whose record ENDED the turn, which is
 * the answer rather than narration (last-turn.ts). Only when the user has spoken to the session
 * since is the older turn looked for in `turns` (oldest first, as read back through the
 * transcript), and there its last assistant text is the answer.
 *
 * `seen` says the tagged prompt is on disk at all: false either because the agent has not written it
 * yet, or because it lies further back than the read went.
 */
export function answerFor(askId: string, last: LastTurn, turns: readonly RelayTurn[]): AnswerState {
  if (promptCarries(last.prompt, askId)) return { status: "answered", reply: last.reply ?? "" };
  const index = turns.findLastIndex((turn) => promptCarries(turn.prompt, askId));
  if (index === -1) return { status: "pending", seen: false };
  if (index < completedCount(turns, last.prompt)) return { status: "answered", reply: turns[index]?.replies.at(-1) ?? "" };
  return { status: "pending", seen: true };
}

/** One line of the record of what was sent where. */
export const auditLine = (entry: { at: string; label: string; askId: string; session: string; cwd: string; chars: number }): string =>
  `${JSON.stringify(entry)}\n`;
