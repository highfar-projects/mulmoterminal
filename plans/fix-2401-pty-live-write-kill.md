# fix: pty-live-write's teardown fails when a shell outlives SIGHUP (#2401)

## Observed

On `test (ubuntu-latest, 3)`, `pty-live-write.spec.ts` intermittently fails in `afterEach` with
`expected 'still running' to be 'exited'`: after `term.kill()` (node-pty's default SIGHUP) the
shell had not exited within `KILL_GRACE_MS`. It failed on main and on unrelated PRs; a re-run of
the job passes. The runs are listed in #2401.

## Cause

Not established. Three candidates the log cannot tell apart: the shell is slow to exit on a loaded
runner, the shell ignores or defers SIGHUP at some moment, or the shell is gone and node-pty's
`onExit` is late.

## Fix (the recommendation in #2401: C, then B)

- **C — diagnostics.** When the shell outlives its first kill, the teardown records its pid,
  `$SHELL`, and one `ps` line (`pid ppid stat etime args`). `ps` finding no such pid is reported
  as "gone, but onExit never fired", which separates the third candidate from the first two, and
  STAT separates a stopped or uninterruptible shell from a slow one.
- **B — escalation.** On POSIX the teardown sends SIGHUP, then SIGKILL if the shell outlived it.
  Windows keeps one bare `kill()`: node-pty's Windows `kill` throws on any signal.
- A shell that exits only on SIGKILL **passes**, and the report is printed with a `[pty-teardown]`
  marker so the CI log can still be searched for it. A shell that outlives every signal **fails**
  with the report as the assertion message.

The rule (which signals, and what the outcome means) is a pure module, `test/support/ptyTeardown.ts`,
with its own spec; the spec file does only the killing, waiting and `ps`. `ps` goes through
`spawnCaptureAsync`, the repo's existing helper, so the pty's `onExit` can still land while it runs.
The hook gets an explicit budget covering both graces and `ps`, since `hookTimeout`'s default is
below that.

## Not in scope

The production close path (`server/session/lifecycle.ts`, `entry.term.kill()`) sends the same
SIGHUP. Whether a real cell can leave a shell behind is the open third decision in #2401 and is
left there.

## Verification

- `test/support/ptyTeardown.spec.ts` covers every verdict, both platforms' signal lists, and the
  unset-`$SHELL` / vanished-pid / no-attempt inputs.
- Run with `SHELL` pointed at a wrapper that ignores SIGHUP (`trap "" HUP` around an interactive
  bash): every live case passes, and each teardown logs `[pty-teardown] ... survived SIGHUP | ps: ...`.
- The same run with the escalation removed (POSIX list cut to SIGHUP only) fails every live case,
  with the report as the assertion message.
