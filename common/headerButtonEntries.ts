import { slugFromLabel, uniqueSlug } from "./agentEntries.js";
import { GITHUB_ICON_PREFIX, githubIconOf } from "./githubIcons.js";

// The header's buttons as Settings changes them (#2622): the top-level list, one entry at a time,
// against the config on disk. What can be ADDED is the two simplest kinds — run a command in a new
// cell (`shell`), or type text into the agent (`input`); folders, `open` and `action` buttons are
// listed and can be removed or moved, and are still written by hand or by the header skill.
//
// An UNCONFIGURED list (`null`) is the built-in set, not nothing, so the first change starts from
// it — adding a button must not silently take the built-in PR button away.

export const MAX_HEADER_BUTTONS = 32;
export const BUTTON_LABEL_MAX = 40;
export const EDITABLE_RUNS = ["shell", "input"] as const;
export type EditableRun = (typeof EDITABLE_RUNS)[number];
export const isEditableRun = (value: unknown): value is EditableRun => EDITABLE_RUNS.some((run) => run === value);

// A Material Symbols name (`build`, `play_arrow`), or one of the octicons this app draws
// (`github:repo`) — an unknown `github:` name would fall through to the symbol font and draw nothing.
const SYMBOL_NAME_RE = /^[a-z0-9_]{1,40}$/;
const isIconName = (icon: string): boolean => (icon.startsWith(GITHUB_ICON_PREFIX) ? githubIconOf(icon) !== null : SYMBOL_NAME_RE.test(icon));

export const BUTTON_PROBLEMS = ["label", "payload", "icon", "full", "missing", "edge", "ordered"] as const;
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
  /** The command for `shell`, the text for `input`. */
  payload: string;
  when: string;
}

export interface NewButton {
  id: string;
  label: string;
  run: EditableRun;
  cmd?: string;
  text?: string;
  icon?: string;
  when?: string;
}

type Changed<T> = { entries: (T | NewButton)[] } | { problem: ButtonProblem };

const allIds = (entries: readonly EntryLike[]): string[] => entries.flatMap((entry) => [entry.id, ...(entry.items ?? []).map((child) => child.id)]);

export function buttonFromDraft(draft: ButtonDraft, taken: readonly string[]): { entry: NewButton } | { problem: ButtonProblem } {
  const label = draft.label.trim();
  const payload = draft.payload.trim();
  const icon = draft.icon.trim();
  const when = draft.when.trim();
  if (!label || label.length > BUTTON_LABEL_MAX) return { problem: "label" };
  if (!payload) return { problem: "payload" };
  if (icon && !isIconName(icon)) return { problem: "icon" };
  const id = uniqueSlug(slugFromLabel(label) || "button", (candidate) => !taken.includes(candidate), taken.length + 2) ?? "button";
  const entry: NewButton = draft.run === "shell" ? { id, label, run: "shell", cmd: payload } : { id, label, run: "input", text: payload };
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
