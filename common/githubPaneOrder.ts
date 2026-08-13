// Which repository's section the GitHub pane leads with.
//
// The pane is opened beside a CELL, and the cell names a directory — so the list is most useful
// with that directory's repository first. Reordering rather than scrolling to it: a scroll that
// lands slightly off looks like nothing happened, it has to re-run on every reload, and a repo
// with no open PRs and no open issues has nothing to scroll to at all, where an empty section at
// the top still answers "yours: none".
//
// Pure and shared so it can be tested without mounting the pane, and so the PR list and the issue
// list cannot drift into ordering themselves differently.

/** The only field either list is ordered by. Both `RepoPrs` and `RepoIssues` carry it. */
export interface RepoGrouped {
  repo: string;
}

/** Case-insensitively, the way GitHub itself treats `owner/repo`. */
const sameRepo = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

/**
 * `owner/repo` for the directory a cell is in, from the reverse map `/api/repo-dirs` already
 * serves — no extra request and no `git` subprocess, since the overlay fetches it anyway for the
 * issue rows' start control.
 *
 * Compared with the CANONICAL spelling `cwdPresets` stores, which is what the candidates carry,
 * so this is a same-path test rather than a containment one. `null` for a directory that names no
 * repository — not a git repo, no `origin`, a forge we cannot act on, or simply a clone the user
 * never registered in Settings. All four are ordinary, and the caller leaves the order alone.
 */
export function repoForCwd(cwd: string | null | undefined, repoDirs: readonly { repo: string; dirs: readonly { path: string }[] }[]): string | null {
  if (!cwd) return null;
  // Case-insensitive on the path too: Windows and the default macOS volume both treat two
  // spellings of one directory as the same one, and this decides presentation rather than access,
  // so the looser answer is the safe one here. (server/infra/path-within.ts carries the strict
  // rule for the places where it is a boundary.)
  const wanted = cwd.toLowerCase();
  return repoDirs.find((entry) => entry.dirs.some((dir) => dir.path.toLowerCase() === wanted))?.repo ?? null;
}

/**
 * `rows` with `repo`'s entry first, everything else in the order it arrived.
 *
 * A stable move, not a sort: the server's order is meaningful (it follows the configured repo
 * list) and only one element is being promoted. Returns the input unchanged when there is no repo
 * to lead with, or when it has no section — which is why a cell in an unregistered clone simply
 * gets the conventional order.
 */
export function leadWithRepo<T extends RepoGrouped>(rows: readonly T[], repo: string | null): T[] {
  if (!repo) return [...rows];
  const at = rows.findIndex((row) => sameRepo(row.repo, repo));
  if (at <= 0) return [...rows];
  const lead = rows[at];
  if (lead === undefined) return [...rows]; // unreachable: findIndex answered a real index
  return [lead, ...rows.slice(0, at), ...rows.slice(at + 1)];
}
