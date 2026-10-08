// How each Files tree row shows git (#2496), from the changed paths the server reports. Pure, so the
// one rule that is easy to get wrong — which FOLDERS carry a mark — is testable without a tree.
import type { FileGitState } from "../../common/fileGitStatus";
import { ancestorDirs } from "./filesTreeState";

/** The letter a changed row carries, as VS Code's explorer shows it. A deleted file has no row. */
export const GIT_LETTER: Record<FileGitState, string> = { modified: "M", added: "A", untracked: "U", deleted: "D", renamed: "R" };

export interface GitDecorations {
  /** The row's own change, or null. A folder has one only when git reports it whole — untracked. */
  stateOf: (path: string) => FileGitState | null;
  /** Whether a folder holds a change somewhere below it, so a collapsed tree still says where. */
  holdsChanges: (path: string) => boolean;
}

export function gitDecorations(files: Record<string, FileGitState>): GitDecorations {
  const changedDirs = new Set(Object.keys(files).flatMap((path) => ancestorDirs(path)));
  return {
    // Own keys only: a file named `constructor` must not find Object.prototype's.
    stateOf: (path) => (Object.hasOwn(files, path) ? (files[path] ?? null) : null),
    holdsChanges: (path) => changedDirs.has(path),
  };
}
