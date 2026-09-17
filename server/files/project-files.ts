// Every file in a project, as ONE flat list of relative paths — what the Files pane's finder
// filters against so a keystroke costs nothing over the wire (#2099).
//
// `.gitignore` is honoured by ASKING GIT, never by parsing it here. The rule is not one file:
// a nested `.gitignore`, `.git/info/exclude`, the user's global excludes and negation patterns
// all decide it, and `server/backends/collectionSelfContainment.ts` already made this same call
// for the same reason. A directory that is not a repository has no such authority to ask, so it
// is walked instead — and the caller is TOLD which of the two answered, because "node_modules is
// absent" means something different in each.
import fs from "node:fs";
import path from "node:path";
import { git } from "../git/worktrees.js";
import { byCodeUnit } from "../../common/byCodeUnit.js";

/** How many paths are sent to the browser. A cap rather than a stream because the whole point is
 *  one request per open; past this the list is cut and the finder SAYS it was cut. */
export const MAX_PROJECT_FILES = 20_000;

/** How many directory entries the non-git walk may look at. Separate from the path cap: a tree
 *  can hold a million entries that yield few files (a deep cache), and the walk has to stop
 *  somewhere the user is still waiting in. */
export const MAX_WALK_ENTRIES = 200_000;

/** Shorter than the shared git timeout: this runs while the finder is open and the user is
 *  typing into an empty list. A repository too slow to answer falls back to the walk. */
const LS_FILES_TIMEOUT_MS = 10_000;

export interface ProjectFileIndex {
  /** Relative to the directory asked about, `/`-separated, sorted by code unit. */
  paths: string[];
  /** The cap was reached — there are more files than these. */
  truncated: boolean;
  /** Which authority answered. `walk` does NOT honour `.gitignore`; nothing in a non-repository
   *  can. The UI says so rather than letting the user believe an ignore file was read. */
  source: "git" | "walk";
}

// Directories the walk never descends into. Deliberately short: this list is a GUESS, and every
// name on it hides real files from someone. Only the ones that are never authored by hand and are
// pathologically large earn a place — `dist` and `build` do not, because a user may well want to
// open what is in them.
const UNWALKED_DIRS = new Set([".git", "node_modules", ".venv", "venv", "__pycache__", ".mypy_cache", ".pytest_cache", ".gradle", ".terraform"]);

/** Every file under `absDir`, as the finder's candidate list. Never throws: an unreadable
 *  directory yields the files that WERE readable, because a half list beats an error dialog in
 *  front of someone who is looking for one file. */
export async function listProjectFiles(absDir: string, limit: number = MAX_PROJECT_FILES): Promise<ProjectFileIndex> {
  const tracked = await gitListedFiles(absDir);
  if (tracked !== null) return capped(tracked, limit, "git");
  return capped(walkFiles(absDir), limit, "walk");
}

/** Sorted, de-duplicated and cut to `limit`. Shared by both sources so neither can differ in the
 *  order the finder shows with an empty query. */
function capped(paths: string[], limit: number, source: ProjectFileIndex["source"]): ProjectFileIndex {
  const unique = [...new Set(paths)].sort(byCodeUnit);
  return { paths: unique.slice(0, limit), truncated: unique.length > limit, source };
}

/** What git says is in this directory: tracked files plus untracked ones it would not ignore.
 *  Null when git could not answer — not a repository, not installed, too slow — which is the
 *  caller's signal to walk instead.
 *
 *  `-z` because the default output QUOTES a path holding a newline or a non-ASCII byte
 *  (`"\346\227\245"`), and the finder would then show and open the escaped spelling. NUL
 *  separation has no such encoding.
 *
 *  Run through `git -C absDir`, so the paths come back relative to that directory — which is
 *  exactly the relative path the pane's tree and `/api/files/browse/*` already speak. */
async function gitListedFiles(absDir: string): Promise<string[] | null> {
  const res = await git(["ls-files", "--cached", "--others", "--exclude-standard", "-z"], absDir, LS_FILES_TIMEOUT_MS);
  if (!res.ok) return null;
  // A path in a merge conflict is listed once per stage, and `--deduplicate` is too new to
  // require — the Set in `capped` is what actually guarantees one entry per path.
  return res.stdout.split("\0").filter((entry) => entry !== "");
}

/** The fallback for a directory git knows nothing about. Depth-first with a shared budget, and
 *  symlinked directories are NOT descended into: one pointing at an ancestor walks forever, and
 *  the alternative (tracking visited inodes) buys nothing the finder can use. A symlink to a FILE
 *  is still offered — opening it resolves through `resolveContained`, which refuses one that
 *  leaves the project. */
function walkFiles(absDir: string): string[] {
  const out: string[] = [];
  // Checked BEFORE the readdir as well as inside the loop: a budget only tested per entry still
  // pays one syscall for every remaining directory in the tree after it has run out.
  let budget = MAX_WALK_ENTRIES;
  const walk = (dir: string, relBase: string): void => {
    if (budget <= 0) return;
    for (const entry of readDirSafely(dir)) {
      if (budget <= 0) return;
      budget -= 1;
      const rel = relBase ? `${relBase}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) out.push(rel);
      else if (entry.isDirectory()) {
        if (!UNWALKED_DIRS.has(entry.name)) walk(path.join(dir, entry.name), rel);
      } else if (entry.isFile()) out.push(rel);
    }
  };
  walk(absDir, "");
  return out;
}

/** One directory's entries, or none. A permission error partway through a walk must cost that
 *  subtree and not the whole list. */
function readDirSafely(dir: string): fs.Dirent[] {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}
