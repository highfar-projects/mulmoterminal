# fix: win-picker-encoding's first case times out on Windows CI (#2372)

## Observed

On the `test_windows` job, `win-picker-encoding.spec.ts` fails with `Test timed out in 15000ms`,
always on the FIRST case (`C:\proj\日本語フォルダ`), on PRs that do not touch the picker. In the
job log of #2378 the first case alone ran past the budget while the other six cases in the file
each finished in well under a second.

## Cause

Every case spawns PowerShell. The first spawn in the file pays PowerShell's cold start on the
runner, and vitest bills that to whichever test runs first against the 15s `testTimeout`. The case
itself is not slow — same shape as #1314 (a one-off load cost billed to the first test).

## Fix

A `beforeAll` in the Windows-only describe spawns PowerShell once, with its own
`POWERSHELL_COLD_START_BUDGET_MS` hook budget, so the cold start is paid outside every test's
budget. The cases and their assertions are unchanged; a real hang still fails, now in the hook.

Not done: raising the global `testTimeout`, or this file's cases' timeouts — that would hide a
slow case rather than place the one-off cost where it belongs.

## Verification

The spec is skipped off Windows, so this is verified on the PR's `test_windows` job: the file
passes, and the first case's reported duration is in line with its siblings.
