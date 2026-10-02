# feat: a Processes page — what each session is running, and worktrees that can go (#2219)

## Decided with the user

- **Where**: its own full-screen page, `/processes`, opened from the toolbar's feature menu
  ("More features") and from the command palette. Settings keeps its surviving-sessions list as it is.
- **Scope of this PR**: items 1 and 2 of the issue. Orphaned processes reparented to PID 1 (item 3)
  are a later PR.
- **Cleanup**: nothing is removed automatically. A worktree is shown as a removal candidate and a
  person presses the button; a process is only highlighted.

## 1. Processes under each session

- Read only while the page is open: the page polls, the server keeps no watcher.
- One `ps -Ao pid=,ppid=,time=,rss=,etime=,lstart=,command=` (with `LC_ALL=C`) and one
  `tmux list-panes -a` per poll. The tree under each pane pid is the session's processes.
- CPU is the change in cumulative CPU time since the previous poll, as `session-cpu.ts` already
  does, NOT `pcpu`: on Linux `pcpu` is a lifetime average and misses a dev server spinning now.
  The first poll has no baseline, so CPU shows as unknown until the second.
- `etime` uses the same parser as `time` (`parseCpuTime`): both print `[D-]HH:MM:SS` / `MM:SS`.
- `lstart` is kept as an opaque string: it is the process's identity together with the pid.
- **Kill**: `POST /api/processes/kill { pid, startedAt }`. The server re-lists, and kills only a pid
  that is (a) still under one of our tmux panes, (b) started at the same `lstart`, and (c) not the
  pane's own root process — ending the whole session is the existing terminate route, which also
  cleans up the pty. SIGTERM, then SIGKILL if the same process is still there after a grace period.
  (a) is what keeps this route from killing an arbitrary process on the machine.

## 2. Worktrees that can be removed

- The repos are those of the folders terminals have run in (`rememberedSessionCwds`), the same source
  the Skills page uses. Only managed worktrees (`listWorktrees`) are listed.
- Per worktree: directory exists, dirty (`git status --porcelain`, untracked files included),
  merged (HEAD is an ancestor of the base start point), an agent session in it (`dirSession`),
  and a tmux pane standing in it (`#{pane_current_path}`, so a plain shell also counts as in use).
- A candidate has none of: missing, dirty, unmerged, in use. The rule is a pure function in
  `common/worktreeCleanup.ts`.
- Removal is the existing `POST /api/worktrees/remove`, with `deleteBranch: true` (the branch is
  merged) and never `force`. A worktree that turned dirty since the list was read is refused there.
- "Merged" is ancestry, so a squash-merged branch reads as unmerged. That is the safe direction.

## Not done

- Orphans reparented to PID 1 (issue item 3), and whether `sessionReapIntervalHours` gets a default.
- No alerting while the page is closed (option B in the issue).
