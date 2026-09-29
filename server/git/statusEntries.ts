// `git status --porcelain=v1 -z` as the Files tree's map of changed paths (#2496). Pure, so every
// shape git prints — a rename's second path, an untracked folder, a conflict — is testable without a
// repository.
import type { FileGitState } from "../../common/fileGitStatus.js";

/** How one entry changed, from its two status letters (index, work tree). */
export function stateOf(xy: string): FileGitState {
  if (xy === "??") return "untracked";
  // A conflict (`UU`, `AA`, `DD`, any `U`) is a file that needs attention: shown as changed.
  if (xy.includes("U") || xy === "AA" || xy === "DD") return "modified";
  if (xy.includes("R")) return "renamed";
  if (xy.includes("D")) return "deleted";
  return xy[0] === "A" ? "added" : "modified";
}

/** The map, or `truncated` once there are more entries than `limit` — the walk stops there rather
 *  than reading the rest of an answer nobody will draw. */
export type StatusEntries = { files: Record<string, FileGitState>; truncated: false } | { files: Record<string, never>; truncated: true };

/** `stdout` is NUL-separated entries, each `XY path`, a rename or copy followed by its old path.
 *  Paths are relative to the repository's root; `prefix` is where the pane's root sits in it
 *  (`git rev-parse --show-prefix`, "" or ending in `/`), and anything outside it is left out. */
export function parseStatusEntries(stdout: string, prefix: string, limit = Number.POSITIVE_INFINITY): StatusEntries {
  const files: Record<string, FileGitState> = {};
  const fields = stdout.split("\0");
  let count = 0;
  for (let i = 0; i < fields.length; i += 1) {
    const field = fields[i] ?? "";
    if (field.length < 4 || field[2] !== " ") continue;
    const xy = field.slice(0, 2);
    // A rename's or copy's ORIGINAL path follows it, and is not an entry of its own.
    if (xy.includes("R") || xy.includes("C")) i += 1;
    const full = field.slice(3).replace(/\/$/, "");
    if (!full.startsWith(prefix) || full.length === prefix.length) continue;
    count += 1;
    if (count > limit) return { files: {}, truncated: true };
    files[full.slice(prefix.length)] = stateOf(xy);
  }
  return { files, truncated: false };
}
