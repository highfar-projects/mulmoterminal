# fix: the Files pane's side by side survives a trip to another cell (#3122)

The side-by-side switch (`on` in `useSideBySide`, #2577) lived only as long as the `FilesPane`
instance and was in nothing the pane hands its host. So:

- Leaving for a cell whose right pane is not files unmounts the pane; the new one is mounted from a
  snapshot that said "editor", and comes back without the Preview.
- Moving between two cells that both show files keeps ONE instance and reloads it in place, so the
  switch went the other way: the previous cell's switch was applied to this cell's file.

## Change

- `FilesPaneState.sideBySide?: boolean` — on the PANE, not on a tab. The switch is the pane's: it stays
  on across tabs and under the Preview alone, so the switch itself (not "both halves are showing") is
  what is recorded, and restoring it reproduces the screen exactly. Absent is off, like `showCanvas`.
  The issue suggested putting it on the tab next to `showPreview`; a per-tab value would invent a
  per-tab behaviour the pane does not have.
- `useSideBySide` exposes the switch as `switchedOn`, read by the snapshot and written by the restore.
- The pane's `teardown()` turns the switch off before every start (the in-place reload case), next to
  the Canvas view's reset. `restorePaneState` only sets it from the state, under the same generation
  check as the Canvas view — so a pane opened FOR a file (#1979) starts without it, and a restore
  left over from an earlier start cannot touch a newer one's switch (Codex round 1).
- `filesPaneStore.asPaneState` passes `sideBySide: true` through its whitelist, so a reload keeps it.

Not touched: the session's "open the next file as …" memory (`filesViewMode.ts`, #3075) — that is about
files not yet open.

## Tests

- `test/src/composables/filesPaneRestore.spec.ts` — the restore rule, including the generation check
  having to come before the remembered file's own load, and a stale restore leaving the switch alone.
- `test/src/components/filesPaneSideBySide.spec.ts` — snapshot, unmount, remount comes back side by
  side; an in-place reload onto a cell with nothing remembered drops it. Both fail on the code before this change.
- `test/src/components/filesPaneStore.spec.ts` — the whitelist round trip.
