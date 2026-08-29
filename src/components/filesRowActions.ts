// The file-tree row menu's rules: what a right-click on a row offers, and how the keyboard moves
// through it once it is open (#1859). Typing a path by hand was the only way to say "look at this
// file" to the agent running next to the tree that already shows it.
//
// Pure, and separate from the pane, because every rule here is about a path resolving somewhere
// OTHER than where it was clicked — which is precisely what a DOM test would not catch.
import { toInsertText } from "./dropPaths";
import { absoluteUnder } from "../composables/canvasOpenFile";

export interface FilesRowAction {
  id: "insert-relative" | "insert-absolute";
  label: string;
  /** Material Symbols ligature. */
  icon: string;
  /** Exactly what goes to the terminal — quoted and space-terminated by `toInsertText`. */
  text: string;
}

export interface FilesRowTarget {
  /** The row's path, relative to the tree's root. */
  pathRel: string;
  /** The tree's root. */
  cwd: string | null;
  /** The terminal an insert goes to, or null where there is none — the full-screen Files view. */
  terminal: { cwd: string | null } | null;
}

// The same icon for both, and it is the one the header's "Insert a file path" button already
// uses: these are that button's job reached from the tree, and telling them apart is the label's
// work, not an icon's.
const ICON = "attach_file";

// Compared without a trailing separator, because `absoluteUnder` JOINS without doubling one: a
// root spelled `/proj/` builds the same absolute path as `/proj`, so it has to answer the same
// here too. The two roots reach this function from different cells, so nothing guarantees one
// spelling. (CodeRabbit, PR #1912 — no entry point that produces the asymmetry was found, so
// this is the two halves of the module agreeing rather than a fix for an observed case.)
const withoutTrailingSeparator = (dir: string): string => (dir.endsWith("/") || dir.endsWith("\\") ? dir.slice(0, -1) : dir);

/**
 * The menu for one row. Empty means no menu at all — the caller leaves the browser's own.
 *
 * A LIST rather than two booleans so a later action (a text file's contents, say) is an entry
 * here and nothing else.
 */
export function filesRowActions({ pathRel, cwd, terminal }: FilesRowTarget): FilesRowAction[] {
  // No root means no path worth inserting: the tree is on the server's default and its rows
  // cannot be resolved against anything the terminal knows.
  if (pathRel === "" || cwd === null || terminal === null) return [];
  const actions: FilesRowAction[] = [];
  // Only when a relative path means the same thing at the other end. The pane keeps the cell it
  // is on when a re-root could not be saved out of, so the tree and the terminal on screen can
  // be two different projects — and `src/index.ts` would then name a file in the wrong one.
  if (terminal.cwd !== null && withoutTrailingSeparator(terminal.cwd) === withoutTrailingSeparator(cwd)) {
    actions.push({ id: "insert-relative", label: "Insert relative path", icon: ICON, text: toInsertText([pathRel]) });
  }
  actions.push({ id: "insert-absolute", label: "Insert absolute path", icon: ICON, text: toInsertText([absoluteUnder(cwd, pathRel)]) });
  return actions;
}

/**
 * Where the arrow keys move focus inside the open menu, or null for a key that is not ours.
 *
 * `at` is the currently focused item's index, or -1 when focus is somewhere else in the menu —
 * which is why Down and Up answer the two ENDS from there rather than an offset from nowhere.
 */
export function menuFocusMove(key: string, at: number, count: number): number | null {
  if (count === 0) return null;
  const last = count - 1;
  if (key === "Home") return 0;
  if (key === "End") return last;
  // Wrapping, because a menu this short is faster to leave by going round than by reversing.
  if (key === "ArrowDown") return at < 0 || at === last ? 0 : at + 1;
  if (key === "ArrowUp") return at <= 0 ? last : at - 1;
  return null;
}
