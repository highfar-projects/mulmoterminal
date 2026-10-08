// The user-configurable terminal header: action buttons + display chips. Read from the global
// AppConfig (~/.mulmoterminal/config.json) and the per-dir DirConfig (<cwd>/.mulmoterminal.json),
// merged, then RESOLVED per session (evaluate `when`, substitute ${vars}) before the client renders.
//
// The button/chip SHAPES + types come from config-schema.ts (zod). This file owns the lenient
// LOADERS (trim, drop-empty, payload-match, dedup, cap) and the per-session resolution types —
// normalization policy that reads better imperatively than as a zod transform.
//
// Hard rule: absent config == today's header. `sanitizeChips` returns null when unconfigured, and the
// resolver passes that through so the client keeps its hardcoded default chips; empty `buttons` means
// only the built-in buttons show.

import { isRecord } from "../../../common/isRecord.js";
import { headerActionName } from "../../../common/headerActions.js";
import { VIEW_TARGETS } from "../../../common/viewTargets.js";
import type { TerminalAgent } from "../../../common/sessionAgent.js";
import type { WorktreeEnvValue } from "../../../common/worktreeEnv.js";

import {
  isHeaderFolder,
  RUN_TYPES,
  BUILTIN_CHIPS,
  MAX_BUTTONS,
  MAX_CHIPS,
  type ActionTarget,
  type RunType,
  type ViewTarget,
  type OpenTarget,
  type HeaderButton,
  type HeaderEntry,
  type HeaderFolder,
  type HeaderChip,
  type BuiltinChip,
} from "../config-schema.js";

export interface HeaderConfig {
  buttons: HeaderEntry[] | null; // null = unconfigured (falls back to DEFAULT_BUTTONS); [] = explicitly none
  chips: HeaderChip[] | null; // null = unconfigured (client uses its default)
  // Entries shaped like buttons that the command palette lists and the header never shows (#2465).
  // No defaults, so absent is simply none.
  commands?: HeaderEntry[];
}

// The header's action buttons when the user hasn't configured `buttons` — a starter set, each an
// ordinary config button so the user can drop/reorder/replace them. `pr` is gated to git repos
// (`when: isGitRepo`) and dropped when the branch has no open PR, so it self-hides where it does
// not apply.
//
// Deliberately short. `reveal` / `files` / `terminal` / `gh` / `pick-file` used to be here and are
// now items in the PATH MENU a session cell puts on its terminal header (TerminalCell's
// `header-lead`): each is an occasional file operation on the directory this cell is in, which is
// the question the path itself asks, and five always-visible icons for them was the wrong trade in a
// tiled cell. `pick-file` edits the prompt rather than navigating, but one menu for every file
// operation is a simpler rule than splitting them by that.
//
// What is left is what a menu would make worse: `pr` self-hides unless the branch has an open PR, so
// it is never noise and is one click exactly when it is wanted.
//
// Listing `buttons` at any level still REPLACES this whole set (it is NOT merged), and the path menu
// is fixed — so a user who lists `reveal` or `pick-file` themselves gets both. That is their own
// explicit choice and it is visible; it is not worth a second config surface to prevent.
export const DEFAULT_BUTTONS: HeaderButton[] = [
  { id: "pr", icon: "github:git-pull-request", label: "Open this branch's PR", run: "open", when: "isGitRepo", open: { pr: true } },
];

// The live context a header is resolved against — all trusted server-side session state.
export interface HeaderContext {
  dir: string;
  dirName: string;
  branch: string | null;
  repo: string | null;
  model: string | null;
  agent: TerminalAgent;
  session: string | null;
  remoteUrl: string | null;
  dirty: number;
  ahead: number;
  behind: number;
  task: string | null;
  isGitRepo: boolean;
  // The current branch's open PR URL, or null. Resolved only when a `pr` button is present; an
  // `open.pr` button resolves to this URL, or is dropped when it's null.
  prUrl: string | null;
  // The per-tree values this directory holds (#1367) — the port its dev server binds, the
  // database name its migrations touch. Empty for a project that declares none, which is most.
  worktreeEnv: WorktreeEnvValue[];
}

export type ResolvedChip = { kind: "builtin"; id: BuiltinChip } | { kind: "custom"; label: string; text: string };
export interface ResolvedButton {
  id: string;
  emoji?: string;
  icon?: string;
  label: string;
  run: RunType;
  // No `cmd`: a shell button's command is never sent to the client — it's re-resolved server-side by id
  // at exec time (see resolveButtonCommand), so the browser never holds a raw command.
  text?: string;
  open?: OpenTarget;
  // What a `run: "action"` button does to the cell it is in. Sent to the client because that is
  // where it happens: unlike a shell command there is nothing to re-resolve server-side.
  action?: ActionTarget;
}
// A folder as the client gets it: its visible children, already resolved. Never empty — a folder
// with nothing left to show is dropped rather than drawn as a menu of nothing.
export interface ResolvedFolder {
  id: string;
  emoji?: string;
  icon?: string;
  label: string;
  items: ResolvedButton[];
}
export type ResolvedEntry = ResolvedButton | ResolvedFolder;
export const isResolvedFolder = (entry: ResolvedEntry): entry is ResolvedFolder => "items" in entry;
export interface ResolvedHeader {
  buttons: ResolvedEntry[];
  commands: ResolvedEntry[];
  chips: ResolvedChip[] | null;
  // Carried alongside the chips rather than as one of them: the `env` chip renders a value per
  // variable, so what it needs is the values, not a marker saying it was configured.
  env: WorktreeEnvValue[];
}

const RUN_TYPE_SET = new Set<string>(RUN_TYPES);
const VIEW_SET = new Set<string>(VIEW_TARGETS);
const BUILTIN_SET = new Set<string>(BUILTIN_CHIPS);
const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const isRunType = (s: string): s is RunType => RUN_TYPE_SET.has(s);
const isViewTarget = (s: string): s is ViewTarget => VIEW_SET.has(s);

function sanitizeOpen(input: unknown): OpenTarget | undefined {
  if (!isRecord(input)) return undefined;
  const url = str(input.url);
  const reveal = str(input.reveal);
  const files = str(input.files);
  const view = str(input.view);
  const target: OpenTarget = {};
  if (url) target.url = url;
  if (reveal) target.reveal = reveal;
  if (files) target.files = files;
  if (view && isViewTarget(view)) target.view = view;
  const terminal = str(input.terminal);
  if (terminal) target.terminal = terminal;
  if (input.pr === true) target.pr = true;
  if (input.pickFile === true) target.pickFile = true;
  return Object.keys(target).length ? target : undefined;
}

// A button needs an id, a label, and a payload matching its run type; anything short of that is dropped.
function sanitizeButton(input: unknown): HeaderButton | null {
  if (!isRecord(input)) return null;
  const id = str(input.id);
  const label = str(input.label);
  const run = str(input.run);
  if (!id || !label || !run || !isRunType(run)) return null;
  const button: HeaderButton = { id, label, run };
  const emoji = str(input.emoji);
  const icon = str(input.icon);
  const when = str(input.when);
  if (emoji) button.emoji = emoji;
  if (icon) button.icon = icon;
  if (when) button.when = when;
  if (typeof input.order === "number" && Number.isFinite(input.order)) button.order = input.order;
  return withPayload(button, input);
}

function withPayload(button: HeaderButton, input: Record<string, unknown>): HeaderButton | null {
  if (button.run === "shell") return str(input.cmd) ? { ...button, cmd: str(input.cmd) } : null;
  if (button.run === "input") return str(input.text) ? { ...button, text: str(input.text) } : null;
  if (button.run === "action") {
    // An unknown action is dropped rather than carried: the client can only dispatch the ones it
    // knows, so a button naming a future one would draw and do nothing. An old name arrives as
    // the current one, so the client knows one vocabulary.
    const action = headerActionName(str(input.action) ?? "");
    return action ? { ...button, action } : null;
  }
  const open = sanitizeOpen(input.open);
  return open ? { ...button, open } : null;
}

// An entry with an `items` array is a folder: an id, a label and at least one child that is itself a
// valid button. A child is loaded by `sanitizeButton`, which requires a `run` — so a folder nested in
// a folder (no `run`) is dropped there, and one level is all that can load.
function sanitizeFolder(input: Record<string, unknown>, items: unknown[]): HeaderFolder | null {
  const id = str(input.id);
  const label = str(input.label);
  if (!id || !label) return null;
  const children = items.map(sanitizeButton).filter((b): b is HeaderButton => b !== null);
  const folder: HeaderFolder = { id, label, items: children.slice(0, MAX_BUTTONS) };
  const emoji = str(input.emoji);
  const icon = str(input.icon);
  const when = str(input.when);
  if (emoji) folder.emoji = emoji;
  if (icon) folder.icon = icon;
  if (when) folder.when = when;
  if (typeof input.order === "number" && Number.isFinite(input.order)) folder.order = input.order;
  return folder;
}

function sanitizeEntry(input: unknown): HeaderEntry | null {
  if (isRecord(input) && Array.isArray(input.items)) return sanitizeFolder(input, input.items);
  return sanitizeButton(input);
}

// Ids are what a shell button is re-resolved by at exec time, so they must stay unique across the
// whole list, folders' children included. A top-level entry keeps its id; a child that repeats any
// id already taken is dropped, and a folder left with no children goes with it.
export function withUniqueIds(entries: HeaderEntry[]): HeaderEntry[] {
  const seen = new Set(entries.map((entry) => entry.id));
  return entries.flatMap((entry): HeaderEntry[] => {
    if (!isHeaderFolder(entry)) return [entry];
    const items = entry.items.filter((child) => {
      if (seen.has(child.id)) return false;
      seen.add(child.id);
      return true;
    });
    return items.length > 0 ? [{ ...entry, items }] : [];
  });
}

// Returns null when `buttons` is absent/malformed — the signal for "unconfigured, use DEFAULT_BUTTONS".
// An explicit array (even empty) is "configured" and replaces the defaults.
export function sanitizeButtons(input: unknown): HeaderEntry[] | null {
  if (!Array.isArray(input)) return null;
  const seen = new Set<string>();
  const out: HeaderEntry[] = [];
  for (const raw of input) {
    const entry = sanitizeEntry(raw);
    if (!entry || seen.has(entry.id)) continue;
    seen.add(entry.id);
    out.push(entry);
    if (out.length >= MAX_BUTTONS) break;
  }
  return withUniqueIds(out);
}

/** Every button, folders' children included — what an id lookup or a "has a pr button" check reads. */
export const flattenEntries = (entries: readonly HeaderEntry[]): HeaderButton[] => entries.flatMap((entry) => (isHeaderFolder(entry) ? entry.items : [entry]));

function sanitizeChip(input: unknown): HeaderChip | null {
  if (typeof input === "string") return BUILTIN_SET.has(input.trim()) ? input.trim() : null;
  if (!isRecord(input)) return null;
  const label = str(input.label);
  const text = str(input.text);
  if (!label || !text) return null;
  const when = str(input.when);
  return when ? { label, text, when } : { label, text };
}

// Returns null when `chips` is absent/malformed — the signal for "unconfigured, use the default".
export function sanitizeChips(input: unknown): HeaderChip[] | null {
  if (!Array.isArray(input)) return null;
  const out: HeaderChip[] = [];
  for (const raw of input) {
    const chip = sanitizeChip(raw);
    if (chip === null) continue;
    out.push(chip);
    if (out.length >= MAX_CHIPS) break;
  }
  return out;
}

export function sanitizeHeaderConfig(raw: unknown): HeaderConfig {
  const record = isRecord(raw) ? raw : {};
  return { buttons: sanitizeButtons(record.buttons), chips: sanitizeChips(record.chips), commands: sanitizeButtons(record.commands) ?? [] };
}

// Merge global under project: buttons keyed by id (project overrides/adds), then ordered by `order`
// (undefined last), stable within equal order. Chips: project wins outright; null passes through.
// Buttons: null == unconfigured. When BOTH levels are unconfigured the result stays null (→ defaults);
// once EITHER level configures a list, the merge produces a concrete array and the defaults are replaced.
export function mergeHeaderConfig(globalConfig: HeaderConfig, projectConfig: HeaderConfig): HeaderConfig {
  const chips = projectConfig.chips ?? globalConfig.chips;
  const buttons =
    globalConfig.buttons === null && projectConfig.buttons === null ? null : mergeEntries(globalConfig.buttons ?? [], projectConfig.buttons ?? []);
  // A command whose id a button already has is dropped: a shell entry is run by id, and one id
  // must name one command.
  const taken = new Set(flattenEntries(buttons ?? DEFAULT_BUTTONS).map((b) => b.id));
  const commands = withoutIds(mergeEntries(globalConfig.commands ?? [], projectConfig.commands ?? []), taken);
  return { buttons, chips, commands };
}

// Keyed by id (project overrides/adds), then ordered by `order`, stable within equal order; unique
// again after the merge, since a project entry may take an id a global folder's child had.
function mergeEntries(globalEntries: readonly HeaderEntry[], projectEntries: readonly HeaderEntry[]): HeaderEntry[] {
  const byId = new Map<string, HeaderEntry>();
  for (const b of globalEntries) byId.set(b.id, b);
  for (const b of projectEntries) byId.set(b.id, b);
  return withUniqueIds(
    [...byId.values()]
      .map((b, i) => ({ b, i }))
      .sort(byOrderThenInsertion)
      .map((x) => x.b),
  );
}

// Entries with none of `taken`'s ids: a clashing entry goes, a folder loses clashing children and
// goes too if none are left.
function withoutIds(entries: readonly HeaderEntry[], taken: ReadonlySet<string>): HeaderEntry[] {
  return entries.flatMap((entry): HeaderEntry[] => {
    if (taken.has(entry.id)) return [];
    if (!isHeaderFolder(entry)) return [entry];
    const items = entry.items.filter((child) => !taken.has(child.id));
    return items.length > 0 ? [{ ...entry, items }] : [];
  });
}

const orderOf = (b: HeaderEntry): number => (typeof b.order === "number" ? b.order : Number.POSITIVE_INFINITY);
function byOrderThenInsertion(a: { b: HeaderEntry; i: number }, b: { b: HeaderEntry; i: number }): number {
  const delta = orderOf(a.b) - orderOf(b.b);
  return delta !== 0 ? delta : a.i - b.i;
}
