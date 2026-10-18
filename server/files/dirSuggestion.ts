// Directory completion for the launch form's Working directory field, the way a shell's
// Tab does it: read the parent of what is typed, offer the children starting with the last segment.
// Pure — the directory read is passed in, so every rule here is testable without a filesystem.
import path from "node:path";
import { expandTilde } from "./pathContainment.js";

export const MAX_DIR_SUGGESTIONS = 50;

export interface CompletionTarget {
  /** The absolute directory to read. */
  parentDir: string;
  /** What the matching child names must start with. */
  namePrefix: string;
  /** The typed text up to and including its last separator — prepended to each name. */
  typedParent: string;
}

const lastSeparatorIndex = (typed: string): number => Math.max(typed.lastIndexOf("/"), typed.lastIndexOf(path.sep));

// A bare `~` completes like `~/`: the home directory's children, in the spelling that was typed.
export function completionTarget(typed: string, homeDir: string): CompletionTarget | null {
  const text = typed === "~" ? "~/" : typed;
  const cut = lastSeparatorIndex(text) + 1;
  const typedParent = text.slice(0, cut);
  const parentDir = expandTilde(typedParent, homeDir);
  if (typedParent === "" || !path.isAbsolute(parentDir)) return null;
  return { parentDir, namePrefix: text.slice(cut), typedParent };
}

// Hidden directories only once a `.` is typed, as a shell completes them. The name already typed
// in full is left out: offering exactly what is in the field is a row that does nothing.
export function matchingNames(names: readonly string[], namePrefix: string, limit: number = MAX_DIR_SUGGESTIONS): string[] {
  const prefix = namePrefix.toLowerCase();
  const showHidden = namePrefix.startsWith(".");
  return names
    .filter((name) => name !== namePrefix && name.toLowerCase().startsWith(prefix) && (showHidden || !name.startsWith(".")))
    .sort((a, b) => a.localeCompare(b, "en"))
    .slice(0, limit);
}

export async function dirSuggestions(typed: string, homeDir: string, listSubdirNames: (dir: string) => Promise<string[]>): Promise<string[]> {
  const target = completionTarget(typed, homeDir);
  if (!target) return [];
  const names = await listSubdirNames(target.parentDir);
  return matchingNames(names, target.namePrefix).map((name) => target.typedParent + name);
}
