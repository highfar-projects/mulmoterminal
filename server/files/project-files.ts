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

/** A source's answer, and whether it got to the end. `complete: false` is a list the finder must
 *  not present as the whole project — the one wrong answer a finder can give is "it is not there"
 *  when it only means "I did not look at all of it". */
interface Listing {
  paths: string[];
  complete: boolean;
}

export interface ProjectFileIndex {
  /** Relative to the directory asked about, `/`-separated, sorted by code unit. */
  paths: string[];
  /** There are more files than these — because the path cap cut the list, OR because the source
   *  itself stopped early (the walk's entry budget). Both leave an incomplete list, so both have
   *  to say so; only the first is visible from the array's own length. */
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
export async function listProjectFiles(absDir: string, limit: number = MAX_PROJECT_FILES, walkBudget: number = MAX_WALK_ENTRIES): Promise<ProjectFileIndex> {
  const tracked = await gitListedFiles(absDir);
  if (tracked !== null) return capped(tracked, limit, "git");
  return capped(walkFiles(absDir, walkBudget), limit, "walk");
}

/** Sorted, de-duplicated and cut to `limit`. Shared by both sources so neither can differ in the
 *  order the finder shows with an empty query. */
function capped(listing: Listing, limit: number, source: ProjectFileIndex["source"]): ProjectFileIndex {
  const unique = [...new Set(listing.paths)].sort(byCodeUnit);
  return { paths: unique.slice(0, limit), truncated: !listing.complete || unique.length > limit, source };
}

/** The mode `git ls-files` gives a tracked SUBMODULE. A gitlink is an ordinary index entry, but the
 *  path is a DIRECTORY on disk — offering it would put a row in the finder that the editor route
 *  answers 400 for, which is the "opens nothing" outcome this module is trying not to produce. */
const GITLINK_MODE = "160000";

/** What git says is in this directory: tracked files plus untracked ones it would not ignore.
 *  Null when git could not answer — not a repository, not installed, too slow — which is the
 *  caller's signal to walk instead.
 *
 *  `-z` because the default output QUOTES a path holding a newline or a non-ASCII byte
 *  (`"\346\227\245"`), and the finder would then show and open the escaped spelling. NUL
 *  separation has no such encoding.
 *
 *  Run through `git -C absDir`, so the paths come back relative to that directory — which is
 *  exactly the relative path the pane's tree and `/api/files/browse/*` already speak.
 *
 *  TWO calls rather than one `--cached --others`, because only `--stage` carries the mode that
 *  tells a submodule apart from a file. The untracked half needs no such check: `--others` lists
 *  files, and an untracked directory is not listed at all without `--directory`.
 *
 *  Only the FIRST call decides whether git can answer at all. If the second fails on its own, the
 *  tracked half is kept and reported as partial rather than thrown away — falling back to the walk
 *  there would put `node_modules` in front of someone whose repository plainly has a `.gitignore`,
 *  which is a worse answer than a list that is short and says so. */
async function gitListedFiles(absDir: string): Promise<Listing | null> {
  const cached = await git(["ls-files", "--stage", "-z"], absDir, LS_FILES_TIMEOUT_MS);
  if (!cached.ok) return null;
  const untracked = await git(["ls-files", "--others", "--exclude-standard", "-z"], absDir, LS_FILES_TIMEOUT_MS);
  const tracked = stagedFiles(cached.stdout);
  if (!untracked.ok) return { paths: tracked, complete: false };
  return { paths: [...tracked, ...splitNul(untracked.stdout)], complete: true };
}

/** The tracked paths that are FILES, out of `ls-files --stage` (`<mode> <object> <stage>\t<path>`).
 *  A path in a merge conflict is listed once per stage; the Set in `capped` collapses those. */
function stagedFiles(stdout: string): string[] {
  return splitNul(stdout).flatMap((entry) => {
    const tab = entry.indexOf("\t");
    if (tab < 0 || entry.slice(0, GITLINK_MODE.length) === GITLINK_MODE) return [];
    return [entry.slice(tab + 1)];
  });
}

const splitNul = (stdout: string): string[] => stdout.split("\0").filter((entry) => entry !== "");

/** The fallback for a directory git knows nothing about. Depth-first with a shared budget, and a
 *  symlink is never descended into: one pointing at an ancestor walks forever, and the alternative
 *  (tracking visited inodes) buys nothing the finder can use. One pointing at a FILE is still
 *  offered — opening it resolves through `resolveContained`, which refuses one that leaves the
 *  project. */
function walkFiles(absDir: string, budgetEntries: number): Listing {
  const out: string[] = [];
  // Checked BEFORE the readdir as well as inside the loop: a budget only tested per entry still
  // pays one syscall for every remaining directory in the tree after it has run out.
  let budget = budgetEntries;
  const walk = (dir: string, relBase: string): void => {
    if (budget <= 0) return;
    for (const entry of readDirSafely(dir)) {
      if (budget <= 0) return;
      budget -= 1;
      const rel = relBase ? `${relBase}/${entry.name}` : entry.name;
      const verdict = walkVerdict(dir, entry);
      if (verdict === "offer") out.push(rel);
      else if (verdict === "descend") walk(path.join(dir, entry.name), rel);
    }
  };
  walk(absDir, "");
  // Running the budget to zero means the walk stopped somewhere rather than finishing — and it can
  // do that while holding FEWER paths than the cap, so the array's length cannot reveal it.
  return { paths: out, complete: budget > 0 };
}

/** What one directory entry is worth: a path to offer the finder, a directory to walk into, or
 *  neither. Its own function so the walk above is the traversal and nothing else — a socket, a
 *  fifo and a device file all land in `skip` without the loop having to say so. */
function walkVerdict(dir: string, entry: fs.Dirent): "offer" | "descend" | "skip" {
  if (entry.isSymbolicLink()) return linksToFile(path.join(dir, entry.name)) ? "offer" : "skip";
  if (entry.isDirectory()) return UNWALKED_DIRS.has(entry.name) ? "skip" : "descend";
  return entry.isFile() ? "offer" : "skip";
}

/** Whether a symlink resolves to a file. Offering one that resolves to a DIRECTORY would put a row
 *  in the finder that opens nothing — the editor route answers 400 for a directory — and a broken
 *  link resolves to nothing at all. One `stat` on an entry type that is rare in a source tree. */
function linksToFile(abs: string): boolean {
  try {
    return fs.statSync(abs).isFile();
  } catch {
    return false; // broken, or a loop the OS refused to follow
  }
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
