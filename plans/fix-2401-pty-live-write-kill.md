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
  `$SHELL`, and one `ps` line (`pid ppid stat etime args`). The probe has three outcomes: a line,
  `absent` (ps ran and found no such pid — the shell is gone before node-pty reported it), and
  `unavailable` (ps missing, refused or timed out). `ps` is run directly as `/bin/ps` rather than
  through `spawnCaptureAsync`, because that helper reports all three failures as exit 1 and the
  distinction is the point. STAT separates a stopped or uninterruptible shell from a slow one.
- **B — escalation.** On POSIX the teardown sends SIGHUP, then SIGKILL if the shell outlived it.
  Windows keeps one bare `kill()`: node-pty's Windows `kill` throws on any signal.
- A shell that exits on its own after the grace but before SIGKILL is sent (typically during the
  `ps` probe) is recorded as **exited late**, not credited to SIGKILL: a slow shell and one that
  needed SIGKILL are different answers. The exit check sits directly before the next kill, with no
  await between them.
- A shell that exits only on SIGKILL **passes**, and the report is printed with a `[pty-teardown]`
  marker so the CI log can still be searched for it. A shell that outlives every signal **fails**
  with the report as the assertion message.

The rule (which signals, how a `ps` result is read, and what the outcome means) is a pure module,
`test/support/ptyTeardown.ts`, with its own spec; the spec file does only the killing, waiting and
running `ps`, asynchronously so the pty's `onExit` can still land while it runs.
The hook gets an explicit budget covering both graces and `ps`, since `hookTimeout`'s default is
below that.

## Not in scope

The production close path (`server/session/lifecycle.ts`, `entry.term.kill()`) sends the same
SIGHUP. Whether a real cell can leave a shell behind is the open third decision in #2401 and is
left there.

## Verification

- `test/support/ptyTeardown.spec.ts` covers every verdict (including `late`), both platforms'
  signal lists, every `ps` outcome and the execFile rejection shapes, and the unset-`$SHELL` /
  no-attempt inputs.
- The probe was checked against real `/bin/ps` on macOS: a live pid reads as a line, an exited pid
  as `absent`, a missing binary as `ENOENT`, a timeout as `timed out`.
- With `KILL_GRACE_MS` cut to 1ms and the default shell, every teardown logs `exited late after
  SIGHUP` rather than an escalation.
- Run with `SHELL` pointed at a wrapper that ignores SIGHUP (`trap "" HUP` around an interactive
  bash): every live case passes, and each teardown logs `[pty-teardown] ... survived SIGHUP | ps: ...`.
- The same run with the escalation removed (POSIX list cut to SIGHUP only) fails every live case,
  with the report as the assertion message.
