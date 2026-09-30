import { slugFromLabel, uniqueSlug } from "./agentEntries.js";
import { GITHUB_ICON_PREFIX, githubIconOf } from "./githubIcons.js";
import { headerActionName } from "./headerActions.js";
import { isViewTargetName, type ViewTargetName } from "./viewTargets.js";

// The header's buttons as Settings changes them (#2622): the top-level list, one entry at a time,
// against the config on disk. What can be ADDED is the two simplest kinds — run a command in a new
// cell (`shell`), type text into the agent (`input`), open something (`open`) or run one of the
// app's named operations (`action`); folders are listed, removed and moved, and still written by
// hand or by the header skill.
//
// An UNCONFIGURED list (`null`) is the built-in set, not nothing, so the first change starts from
// it — adding a button must not silently take the built-in PR button away.

export const MAX_HEADER_BUTTONS = 32;
export const BUTTON_LABEL_MAX = 40;
export const EDITABLE_RUNS = ["shell", "input", "open", "action"] as const;
export type EditableRun = (typeof EDITABLE_RUNS)[number];
export const isEditableRun = (value: unknown): value is EditableRun => EDITABLE_RUNS.some((run) => run === value);

// A Material Symbols name (`build`, `play_arrow`), or one of the octicons this app draws
// (`github:repo`) — an unknown `github:` name would fall through to the symbol font and draw nothing.
const SYMBOL_NAME_RE = /^[a-z0-9_]{1,40}$/;
const isIconName = (icon: string): boolean => (icon.startsWith(GITHUB_ICON_PREFIX) ? githubIconOf(icon) !== null : SYMBOL_NAME_RE.test(icon));

export const BUTTON_PROBLEMS = ["label", "payload", "icon", "target", "action", "full", "missing", "edge", "ordered"] as const;

/** What an `open` button opens. The first four take a value (a URL, a path, an overlay's name);
 *  the last two take none. */
export const OPEN_TARGET_KINDS = ["url", "files", "reveal", "terminal", "view", "pr", "pickFile"] as const;
export type OpenTargetKind = (typeof OPEN_TARGET_KINDS)[number];
export const isOpenTargetKind = (value: unknown): value is OpenTargetKind => OPEN_TARGET_KINDS.some((kind) => kind === value);
const VALUELESS_TARGETS: readonly OpenTargetKind[] = ["pr", "pickFile"];
export const openTargetTakesValue = (kind: OpenTargetKind): boolean => !VALUELESS_TARGETS.includes(kind);

export interface OpenTargetEntry {
  url?: string;
  files?: string;
  reveal?: string;
  terminal?: string;
  view?: ViewTargetName;
  pr?: true;
  pickFile?: true;
}
export type ButtonProblem = (typeof BUTTON_PROBLEMS)[number];
export const isButtonProblem = (value: unknown): value is ButtonProblem => BUTTON_PROBLEMS.some((problem) => problem === value);

/** What every entry in the list has, whatever kind it is. */
export interface EntryLike {
  id: string;
  order?: number | undefined;
  items?: readonly { id: string }[] | undefined;
}

export interface ButtonDraft {
  label: string;
  icon: string;
  run: EditableRun;
  /** The command for `shell`, the text for `input`, the value an `open` target takes (a URL, a path,
   *  an overlay's name), or the action's name. */
  payload: string;
  /** What an `open` button opens; ignored for the other kinds. */
  target: string;
  when: string;
}

export interface NewButton {
  id: string;
  label: string;
  run: EditableRun;
  cmd?: string;
  text?: string;
  open?: OpenTargetEntry;
  action?: string;
  icon?: string;
  when?: string;
}

type Changed<T> = { entries: (T | NewButton)[] } | { problem: ButtonProblem };

const allIds = (entries: readonly EntryLike[]): string[] => entries.flatMap((entry) => [entry.id, ...(entry.items ?? []).map((child) => child.id)]);

type Payload = { fields: Pick<NewButton, "cmd" | "text" | "open" | "action"> } | { problem: ButtonProblem };

function openTarget(kind: OpenTargetKind, value: string): OpenTargetEntry | null {
  if (kind === "pr") return { pr: true };
  if (kind === "pickFile") return { pickFile: true };
  if (kind === "view") return isViewTargetName(value) ? { view: value } : null;
  return value ? { [kind]: value } : null;
}

function payloadFor(run: EditableRun, value: string, target: string): Payload {
  if (run === "shell") return value ? { fields: { cmd: value } } : { problem: "payload" };
  if (run === "input") return value ? { fields: { text: value } } : { problem: "payload" };
  if (run === "action") {
    const action = headerActionName(value);
    return action ? { fields: { action } } : { problem: "action" };
  }
  if (!isOpenTargetKind(target)) return { problem: "target" };
  const open = openTarget(target, value);
  return open ? { fields: { open } } : { problem: "payload" };
}

export function buttonFromDraft(draft: ButtonDraft, taken: readonly string[]): { entry: NewButton } | { problem: ButtonProblem } {
  const label = draft.label.trim();
  const icon = draft.icon.trim();
  const when = draft.when.trim();
  if (!label || label.length > BUTTON_LABEL_MAX) return { problem: "label" };
  if (icon && !isIconName(icon)) return { problem: "icon" };
  const payload = payloadFor(draft.run, draft.payload.trim(), draft.target);
  if ("problem" in payload) return payload;
  const id = uniqueSlug(slugFromLabel(label) || "button", (candidate) => !taken.includes(candidate), taken.length + 2) ?? "button";
  const entry: NewButton = { id, label, run: draft.run, ...payload.fields };
  if (icon) entry.icon = icon;
  if (when) entry.when = when;
  return { entry };
}

export function entriesWithAdded<T extends EntryLike>(current: readonly T[] | null, defaults: readonly T[], draft: ButtonDraft): Changed<T> {
  const entries = [...(current ?? defaults)];
  if (entries.length >= MAX_HEADER_BUTTONS) return { problem: "full" };
  const built = buttonFromDraft(draft, allIds(entries));
  return "problem" in built ? built : { entries: [...entries, built.entry] };
}

export function entriesWithout<T extends EntryLike>(current: readonly T[] | null, defaults: readonly T[], id: string): Changed<T> {
  const entries = [...(current ?? defaults)];
  if (!entries.some((entry) => entry.id === id)) return { problem: "missing" };
  return { entries: entries.filter((entry) => entry.id !== id) };
}

// Position only decides the order between entries with no `order`; one that sets it is placed by
// that number wherever it sits in the list, so moving it here would change nothing on screen.
export function entriesMoved<T extends EntryLike>(current: readonly T[] | null, defaults: readonly T[], id: string, delta: -1 | 1): Changed<T> {
  const entries = [...(current ?? defaults)];
  const index = entries.findIndex((entry) => entry.id === id);
  const moving = entries[index];
  const neighbour = entries[index + delta];
  if (moving === undefined) return { problem: "missing" };
  if (neighbour === undefined) return { problem: "edge" };
  if (moving.order !== undefined || neighbour.order !== undefined) return { problem: "ordered" };
  const swap = { from: index, to: index + delta, moving, neighbour };
  return { entries: entries.map((entry, i) => swapped(entry, i, swap)) };
}

function swapped<T>(entry: T, i: number, swap: { from: number; to: number; moving: T; neighbour: T }): T {
  if (i === swap.from) return swap.neighbour;
  return i === swap.to ? swap.moving : entry;
}
