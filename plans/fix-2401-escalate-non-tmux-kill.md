# fix: a closed cell whose program ignores SIGHUP runs on untracked (#2401, decision 3)

## Problem

Two production paths end a pty that runs its program directly, not under tmux, with a single
`term.kill()`, which is SIGHUP on POSIX:

- `reap()` in `server/session/lifecycle.ts` when `entry.tmux` is false: any persistent session
  on a host without tmux, and any non-persistent session. The entry is removed from `ptys` before
  the kill, so a program that ignores SIGHUP keeps running with nothing tracking it until the
  server exits.
- A command cell's socket close (`beginRunTerminal` in `server/routes/ws-routes.ts`).
- The rate-limit probe's stop (`server/agents/rate-limit-probe.ts`): a hidden claude in a direct pty,
  whose only handle is dropped after the stop.

The tmux path is unaffected: its pty is only the tmux client, and `tmux kill-session` ends the
pane. It is left as it is.

## Fix

- `server/session/pty-kill-plan.ts` (pure): `killSignalsFor(platform)`. POSIX gets SIGHUP then
  SIGKILL. Windows gets one bare kill, because node-pty's Windows `kill` throws on any signal. The
  `pty-live-write` spec's teardown now imports it from here instead of keeping its own copy.
- `server/session/pty-kill.ts`: `killPty(term, { label })` sends SIGHUP, and SIGKILL after
  `PTY_KILL_GRACE_MS` if the pty has not exited, logging a warning when it escalates. The timer is
  `unref`ed so it cannot hold a shutting-down server open.
- **Exit is tracked from the spawn** (`trackPtyExit`, called in `spawnPty`, the only `pty.spawn`
  site). `reap()` also runs from `onExit`, after the program is already gone, and a listener
  added at kill time would never fire, so the delayed SIGKILL would go to whatever process the OS
  had given that pid next. A pty that has exited is sent nothing at all.
- **Scope.** node-pty signals only the pty's own pid. A command cell runs its command under
  `$SHELL -c`, so a child the command started can outlive the wrapper, and with SIGHUP ignored it
  outlives the SIGKILL too (reproduced on a real server: the child was left with ppid 1). Command
  cells therefore escalate with `scope: "group"`: after the grace, if the pty's process group
  (pgid = pid, since node-pty starts the child with setsid) still has members, the whole group
  gets SIGKILL, even if the wrapper itself has already gone. `reap()` and the probe keep
  `scope: "process"` (the pid only). That was a product decision: a session's background
  processes that ignore SIGHUP, such as a `nohup` server, survive a close on a tmux host, and
  would otherwise be killed only on hosts without tmux.
- The three paths above call `killPty`. A command cell's label is just `command cell`, without the
  command line, so the warning cannot carry arguments into the log.

## Verification

- Wiring: `lifecycle.spec.ts` (a direct pty goes through `killPty` with its session label; a tmux
  one gets `term.kill()` plus `tmuxKillSession` and never `killPty`), `ws-run-terminal.spec.ts`
  (`killPty` with `scope: "group"`), and `rate-limit-probe.spec.ts` (`killPty` with its label).
  Reverting any caller to a bare `kill()`, or dropping the group scope, turns its spec red.

- `test/server/session/pty-kill.spec.ts`: both platforms' signal plans, SIGHUP-only when the
  program exits in time, SIGKILL at the grace and not before, no repeat after the last signal,
  nothing sent to an already-exited pty, Windows never escalating, and a throwing kill swallowed.
  Removing either exited check turns it red.
- Real server (this checkout, scratch `HOME`, scratch port):
  - command cell, group scope: a wrapper that ignores SIGHUP plus its child, and a wrapper that
    exits on SIGHUP plus a child that ignores it. In both, the child is alive 2s after the close
    and gone by 8s, and the server logs `command cell (process group …) outlived its kill …`.
  - command cell (`/ws/run` + `script.json`): a normal command is gone within a second of the
    socket closing, with no warning. A command that ignores SIGHUP is still alive 2s after the
    close and gone by 7s, and the server logs `command cell (pid …) outlived its kill for 5000ms;
    sending SIGKILL`.
  - `reap()` without tmux (server started with tmux absent from `PATH`; it logs `[tmux] not found`;
    `/ws/launch?shell=1`, then a `terminate` frame): a normal shell exits with `signal=1`. A shell
    that ran `trap '' HUP; exec …` exits with `signal=9 after 6.1s`, after the escalation warning.

## Not covered

- Windows: the path is unchanged (one bare kill), and not run here.
- A real host without tmux (Linux) was not used; tmux was hidden from `PATH` on macOS instead.
