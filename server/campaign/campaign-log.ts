// A campaign's durable record, as a pure format.
//
// APPEND-ONLY, for the reason `room-log.ts` is: MULMOTERMINAL_HOME is shared by every server on
// this machine, so a read-merge-write would lose whichever writer finished first. One JSON object
// per line; a line that does not parse is dropped on its own, so a file cut off mid-append costs
// the last record and never the ones before it.
//
// The shape that matters is **intent then outcome**. Every side effect a campaign causes — spawning
// a session, injecting a prompt, opening a PR, merging, closing — happens outside this process and
// cannot be made atomic with writing it down. So the intent is appended BEFORE the effect and the
// outcome AFTER it, and an intent with no outcome is exactly the crash window: the one place where
// reconciliation has to go and ask the world what actually happened.
import { isRecord } from "../../common/isRecord.js";
import { isCampaignPhase, type CampaignPhase } from "../../common/campaignPhase.js";
import { advance, isCampaignEvent, type CampaignEvent } from "./campaign-state.js";

/** About to cause an event. Written before the side effect. */
export interface CampaignIntent {
  kind: "intent";
  at: number;
  task: string;
  attempt: number;
  event: CampaignEvent;
}

/** The event happened, and the task is now here. Written after the side effect. */
export interface CampaignSettled {
  kind: "settled";
  at: number;
  task: string;
  attempt: number;
  event: CampaignEvent;
  phase: CampaignPhase;
}

/** The event did not happen. The task stays where it was; the attempt is spent. */
export interface CampaignAbandoned {
  kind: "abandoned";
  at: number;
  task: string;
  attempt: number;
  event: CampaignEvent;
  note: string;
}

export type CampaignRecord = CampaignIntent | CampaignSettled | CampaignAbandoned;

/**
 * The name a campaign gives the things it creates outside itself — a branch, a PR title, a session.
 *
 * Derived rather than stored, and that is the point: on restart the runner asks the forge and the
 * clone "is there already something called this?" instead of trusting its own log, which is the
 * half that may be missing.
 */
export const idempotencyKey = (campaign: string, task: string, attempt: number): string => `campaign/${campaign}/${task}/${attempt}`;

/** The newline LEADS rather than trails, like `room-log.ts`: whatever the file ended with, an
 *  appended record starts its own line, so a torn write costs one record and not the next. */
export const recordLine = (record: CampaignRecord): string => `\n${JSON.stringify(record)}`;

// An attempt is a positive whole number and nothing else. It comes off a file, so it is unbounded
// until something bounds it — and `1e20` would render into an idempotency key and compare in ways
// no reader expects, the reason `isIssueNumber` in common/prPhase.ts is written the same way.
const isAttempt = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v > 0;

// `Number.isFinite` and not `typeof === "number"`: `JSON.parse` turns `1e309` into `Infinity`,
// which `JSON.stringify` writes back as `null` — so a record accepted with one would not survive
// being re-serialised. The reader has to refuse exactly what the writer refuses, or the round-trip
// check in `appendCampaignRecord` is checking against a laxer reader than the one that runs later.
function isCommon(raw: Record<string, unknown>): boolean {
  return Number.isFinite(raw.at) && typeof raw.task === "string" && isAttempt(raw.attempt) && isCampaignEvent(raw.event);
}

const isCampaignRecord = (raw: unknown): raw is CampaignRecord => {
  if (!isRecord(raw) || !isCommon(raw)) return false;
  if (raw.kind === "intent") return true;
  if (raw.kind === "settled") return isCampaignPhase(raw.phase);
  return raw.kind === "abandoned" && typeof raw.note === "string";
};

function parsedLine(line: string): CampaignRecord | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    const raw: unknown = JSON.parse(trimmed);
    return isCampaignRecord(raw) ? raw : null;
  } catch {
    return null;
  }
}

/** Every record the file holds, in the order it was appended.
 *
 *  NOT sorted by `at`, for `room-log.ts`'s reason: two writers on one machine can stamp the same
 *  millisecond, and a clock that steps backwards would reorder history. The file's order is what
 *  actually happened. */
export const parseCampaignLog = (contents: string): CampaignRecord[] => contents.split("\n").flatMap((line) => parsedLine(line) ?? []);

/** Why a record could not be applied. Never dropped silently — see `CampaignFold.rejected`. */
export interface RejectedRecord {
  record: CampaignRecord;
  reason: "no-intent" | "wrong-event" | "illegal-transition" | "phase-mismatch" | "intent-while-pending" | "attempt-reused";
}

export interface TaskState {
  task: string;
  phase: CampaignPhase;
  /** An intent recorded with nothing after it: the crash window reconciliation must resolve. */
  pending: CampaignIntent | null;
  /** The highest attempt seen. The next side effect for this task uses `attempt + 1`. */
  attempt: number;
}

export interface CampaignFold {
  tasks: readonly TaskState[];
  /**
   * Records the log could not apply.
   *
   * A campaign holding any of these must escalate rather than carry on: the state it would carry
   * on from is one nobody can vouch for, and the pipeline's rule for that is fail closed. Reported
   * rather than thrown, because a corrupt line is data about a real event and the runner needs to
   * put it in front of a person, not die reading it.
   */
  rejected: readonly RejectedRecord[];
}

const START: CampaignPhase = "intake";

function applyIntent(state: TaskState, record: CampaignIntent): TaskState | RejectedRecord["reason"] {
  // Caught here rather than at settlement: an intent is written before the side effect, so a log
  // that declares an impossible one has already done something the machine did not allow.
  if (advance(state.phase, record.event) === null) return "illegal-transition";
  // Two effects in flight for one task is not a state this pipeline has. The second is the bug.
  if (state.pending !== null) return "intent-while-pending";
  // Attempts STRICTLY increase, which is what makes an idempotency key single-use. Reusing one
  // after an abandonment is the dangerous case: the abandoned attempt may have left a branch or a
  // PR behind under that very name, and a restart asking the forge "does this already exist?"
  // would find it and conclude the retry had already happened.
  if (record.attempt <= state.attempt) return "attempt-reused";
  return { ...state, pending: record, attempt: record.attempt };
}

/** Whether this settlement or abandonment answers the intent that is actually outstanding. */
function answers(state: TaskState, record: CampaignSettled | CampaignAbandoned): RejectedRecord["reason"] | null {
  if (state.pending === null) return "no-intent";
  if (state.pending.event !== record.event || state.pending.attempt !== record.attempt) return "wrong-event";
  return null;
}

function applySettled(state: TaskState, record: CampaignSettled): TaskState | RejectedRecord["reason"] {
  const unanswered = answers(state, record);
  if (unanswered !== null) return unanswered;
  const next = advance(state.phase, record.event);
  if (next === null) return "illegal-transition";
  if (next !== record.phase) return "phase-mismatch";
  return { ...state, phase: next, pending: null };
}

function applyRecord(state: TaskState, record: CampaignRecord): TaskState | RejectedRecord["reason"] {
  if (record.kind === "intent") return applyIntent(state, record);
  if (record.kind === "abandoned") return answers(state, record) ?? { ...state, pending: null };
  return applySettled(state, record);
}

/**
 * What the log says about every task in it.
 *
 * Replays the records through the state machine rather than believing the phase written on them:
 * a settlement naming a transition the machine does not have is a corrupt log, not a new edge.
 */
export function foldCampaignLog(records: readonly CampaignRecord[]): CampaignFold {
  const tasks = new Map<string, TaskState>();
  const rejected: RejectedRecord[] = [];
  records.forEach((record) => {
    const state = tasks.get(record.task) ?? { task: record.task, phase: START, pending: null, attempt: 0 };
    const applied = applyRecord(state, record);
    if (typeof applied === "string") rejected.push({ record, reason: applied });
    else tasks.set(record.task, applied);
  });
  return { tasks: [...tasks.values()], rejected };
}

/** The tasks a restart has to ask the world about, because a side effect may have happened. */
export const pendingTasks = (fold: CampaignFold): readonly TaskState[] => fold.tasks.filter((task) => task.pending !== null);
