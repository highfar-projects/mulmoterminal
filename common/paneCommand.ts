// Commands an agent sends to its own cell's right pane (#3022): show a file, or put a checklist in
// front of the human. Both sides decide from these — the server parses the tool arguments and
// publishes, the grid listens and acts — so the channel, the shapes and the text typed back live here.
import { isRecord } from "./isRecord.js";

export const PANE_COMMAND_CHANNEL = "pane-command";

export const PANE_VIEWS = ["editor", "preview", "canvas", "split"] as const;
export type PaneView = (typeof PANE_VIEWS)[number];
const isPaneView = (value: unknown): value is PaneView => PANE_VIEWS.some((view) => view === value);

/** Where a file is shown: relative to the cell's directory, which the server checked it is inside. */
export interface PaneTarget {
  path: string;
  view: PaneView;
  /** 1-based; a line puts the file on its editor, at that line. */
  line?: number;
}

export interface PaneShow extends PaneTarget {
  kind: "show";
  sessionId: string;
  /** The directory `path` is relative to, so the browser can refuse a pane rooted somewhere else. */
  cwd: string;
}

export interface CheckItem {
  label: string;
  /** What to open for this item, when it has a file. */
  target?: PaneTarget;
}

export interface PaneCheck {
  kind: "check";
  sessionId: string;
  cwd: string;
  id: string;
  title: string;
  items: CheckItem[];
}

export type PaneCommand = PaneShow | PaneCheck;

/** The most items one check carries: past this it is not a check a person works through. */
export const MAX_CHECK_ITEMS = 20;
const MAX_TEXT = 300;

const text = (value: unknown): string | null => (typeof value === "string" && value.trim() !== "" ? value.trim().slice(0, MAX_TEXT) : null);
const lineOf = (value: unknown): number | undefined => (typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined);

/** A tool's file argument: `path` and an optional `view` (default `editor`) and `line`. The path is
 *  NOT contained here — that needs the filesystem, and is the server's job. */
export function parseTarget(raw: unknown): PaneTarget | null {
  if (!isRecord(raw)) return null;
  const path = text(raw.path);
  if (!path) return null;
  const view = raw.view === undefined ? "editor" : raw.view;
  if (!isPaneView(view)) return null;
  const line = lineOf(raw.line);
  return line === undefined ? { path, view } : { path, view, line };
}

export interface CheckRequest {
  title: string;
  items: { label: string; target?: PaneTarget }[];
}

type CheckItemRequest = CheckRequest["items"][number];

/** One item, or the sentence saying what is wrong with it. */
function parseCheckItem(item: unknown): CheckItemRequest | string {
  const label = isRecord(item) ? text(item.label) : null;
  if (!label || !isRecord(item)) return "Every requestCheck item needs a non-empty label.";
  if (item.path === undefined) return { label };
  const target = parseTarget(item);
  return target ? { label, target } : `Item "${label}": path must be a non-empty string and view one of ${PANE_VIEWS.join(", ")}.`;
}

/** `requestCheck`'s arguments, or the sentence saying what is wrong with them. */
export function parseCheckRequest(raw: unknown): CheckRequest | string {
  if (!isRecord(raw)) return "requestCheck takes { title, items }.";
  if (!Array.isArray(raw.items) || raw.items.length === 0) return "requestCheck needs at least one item.";
  if (raw.items.length > MAX_CHECK_ITEMS) return `requestCheck takes at most ${MAX_CHECK_ITEMS} items.`;
  const parsed = raw.items.map(parseCheckItem);
  const problem = parsed.find((item): item is string => typeof item === "string");
  if (problem !== undefined) return problem;
  return { title: text(raw.title) ?? "Check", items: parsed.filter((item): item is CheckItemRequest => typeof item !== "string") };
}

const isTarget = (value: unknown): value is PaneTarget =>
  isRecord(value) && typeof value.path === "string" && isPaneView(value.view) && (value.line === undefined || lineOf(value.line) !== undefined);
const isCheckItem = (value: unknown): value is CheckItem =>
  isRecord(value) && typeof value.label === "string" && (value.target === undefined || isTarget(value.target));

/** A command off the channel, which carries JSON nothing has checked. */
export function isPaneCommand(value: unknown): value is PaneCommand {
  if (!isRecord(value) || typeof value.sessionId !== "string" || typeof value.cwd !== "string") return false;
  if (value.kind === "show") return isTarget(value);
  return (
    value.kind === "check" && typeof value.id === "string" && typeof value.title === "string" && Array.isArray(value.items) && value.items.every(isCheckItem)
  );
}

export interface CheckAnswer {
  ok: boolean;
  note: string;
}

/** What is typed into the terminal when the human has answered every item, read by the agent as the
 *  user's next message. ONE line: a newline typed into a TUI is Enter, and would send it half-written;
 *  and no control bytes, since an ESC sequence typed into the PTY is a keystroke, not text. */
const oneLine = (value: string): string =>
  value
    .replace(/[\p{Cc}\p{Cf}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

export function checkSummary(check: Pick<PaneCheck, "title" | "items">, answers: readonly CheckAnswer[]): string {
  const lines = check.items.map((item, index) => {
    const answer = answers[index];
    const verdict = answer?.ok ? "OK" : "NG";
    const note = answer && oneLine(answer.note) ? ` — ${oneLine(answer.note)}` : "";
    return `${index + 1}. ${verdict}: ${oneLine(item.label)}${note}`;
  });
  const failed = answers.filter((answer) => !answer.ok).length;
  const tally = failed === 0 ? "all OK" : `${failed} NG`;
  const head = `Check results for "${oneLine(check.title)}" (${tally}):`;
  return [head, ...lines].join(" ");
}

/** Typed in when the user puts the card away unanswered, so an agent told to wait for the results is
 *  not left waiting for a message that will never come. */
export const checkClosedNotice = (check: Pick<PaneCheck, "title">): string => `Check "${oneLine(check.title)}" was closed without answers.`;
