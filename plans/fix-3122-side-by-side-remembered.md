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
- `useSideBySide` exposes the switch as `switchedOn`, read by the snapshot and written by `FilesPane.start()`.
- `FilesPane.start()` sets the switch from `initialState.sideBySide` as its FIRST statement, before
  any await. Every start (mount, reload, re-root) therefore decides it, including a reload onto a cell
  with nothing remembered (off), and a start that a later reload replaced can never write it. Rounds 1
  and 2 of the review each found a race in a version that wrote it later; this placement removes the
  class rather than guarding each write.
- A file opened FOR the start (a clicked path) keeps the remembered switch, as it would in a pane that
  had stayed open. #1979's "an open that wins keeps its own view" is about the file's view (Preview,
  Canvas), which is per file; the switch is not.
- `useSideBySide.toggle()` turns the switch on BEFORE awaiting the way out of the Preview, so a start
  that runs in that gap is not overwritten by the press's continuation (Codex round 2).
- `filesPaneStore.asPaneState` passes `sideBySide: true` through its whitelist, so a reload keeps it.

Not touched: the session's "open the next file as …" memory (`filesViewMode.ts`, #3075) — that is about
files not yet open.

## Tests

- `test/src/components/filesPaneSideBySide.spec.ts` — snapshot, unmount, remount comes back side by
  side; an in-place reload onto a cell with nothing remembered drops it; a replaced start whose tree
  read lands last does not turn it on; a file the pane was opened for keeps it.
- `test/src/composables/useSideBySide.spec.ts` — a press waiting on the Preview does not switch back on
  a pane started over meanwhile.
- `test/src/components/filesPaneStore.spec.ts` — the whitelist round trip.
