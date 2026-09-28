# Blueprints: open the files changed since a build started

Issue: #2384

## Why

A finished document build's report names what it produced ("the proposal is in `contract.proposed.txt`"), but the run view gave no way to open it. An ordinary user would have to find the folder some other way.

## Shape

- `common/blueprint/changedFiles.ts` (pure): which files count — changed at or after the build was created (mostly what the build wrote, but a person's edits or another build's in the same folder show too, so the UI says "changed"), none under a hidden folder or `node_modules` — in character-code order, capped, with a flag for more.
- `listProjectFiles` (server): walks the folder breadth first, one folder at a time, not entering links, hidden folders or installed packages. It streams each folder's names and stops at an entry budget and a depth, and stats files in small batches, so a large folder, or one huge level, is not read whole.
- The report view carries `changed`; the run view lists the files once every step is done. Each opens in the full-screen Files view at `/files?cwd=<folder>&path=<file>`, and a button opens the folder.

The Files view's containment is unchanged: the base is the build's folder, and `path` is resolved inside it.

## Verification

- The rule: the time boundary, the skipped names, the order, the cap.
- The walk on a real folder: hidden folders, `node_modules`, links, depth and entry limits.
- The run view: each file opens with the folder as base; the folder button; nothing written; more than listed; not shown mid-build.
- In a browser on the test server, a finished review build listed only `contract.proposed.txt` (not the sample placed before it started); clicking opened it in the Files view, and back returned to the run.
