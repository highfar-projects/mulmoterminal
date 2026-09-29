// What the Files tree shows of git (#2496): each changed path under the pane's root and how it
// changed. Both ends decide from this shape — the server builds it from `git status`, the tree draws
// from it — so it lives here once.

export const FILE_GIT_STATES = ["modified", "added", "untracked", "deleted", "renamed"] as const;
export type FileGitState = (typeof FILE_GIT_STATES)[number];

export const isFileGitState = (value: unknown): value is FileGitState => FILE_GIT_STATES.some((state) => state === value);

/** `files` is keyed by path relative to the pane's root, `/`-separated. An untracked folder that git
 *  reports whole (`dir/`) is keyed by the folder's own path. Empty for a folder that is not in git. */
export interface FileGitStatus {
  repo: boolean;
  files: Record<string, FileGitState>;
  /** More changes than the tree will mark: `files` is then empty rather than a part of them, since a
   *  folder left unmarked would read as one with nothing changed in it. */
  truncated?: boolean;
}

/** How many changed paths the tree marks at most. Past it the pane shows none (see `truncated`). */
export const MAX_GIT_STATUS_ENTRIES = 2000;
