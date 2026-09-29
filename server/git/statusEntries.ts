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

interface Walk {
  /** The next field is a rename's or copy's ORIGINAL path, which is not an entry of its own. */
  skip: boolean;
  files: Record<string, FileGitState>;
}

/** `stdout` is NUL-separated entries, each `XY path`, a rename or copy followed by its old path.
 *  Paths are relative to the repository's root; `prefix` is where the pane's root sits in it
 *  (`git rev-parse --show-prefix`, "" or ending in `/`), and anything outside it is left out. */
export function parseStatusEntries(stdout: string, prefix: string): Record<string, FileGitState> {
  const walked = stdout.split("\0").reduce<Walk>(
    (walk, field) => {
      if (walk.skip) return { ...walk, skip: false };
      if (field.length < 4 || field[2] !== " ") return walk;
      const xy = field.slice(0, 2);
      const skip = xy.includes("R") || xy.includes("C");
      const full = field.slice(3).replace(/\/$/, "");
      if (!full.startsWith(prefix) || full.length === prefix.length) return { ...walk, skip };
      return { skip, files: { ...walk.files, [full.slice(prefix.length)]: stateOf(xy) } };
    },
    { skip: false, files: {} },
  );
  return walked.files;
}
