# Blueprints: open the files a finished build wrote

Issue: #2384

## Why

A finished document build's report names what it produced ("the proposal is in `contract.proposed.txt`"), but the run view gave no way to open it. An ordinary user would have to find the folder some other way.

## Shape

- `common/blueprint/writtenFiles.ts` (pure): which files count as written — changed at or after the build was created, none under a hidden folder or `node_modules` — in character-code order, capped, with a flag for more.
- `listProjectFiles` (server): walks the folder one depth at a time, not entering links, hidden folders or installed packages, and stops at a depth and an entry budget so a large folder is not read whole.
- The report view carries `written`; the run view lists the files once every step is done. Each opens in the full-screen Files view at `/files?cwd=<folder>&path=<file>`, and a button opens the folder.

The Files view's containment is unchanged: the base is the build's folder, and `path` is resolved inside it.

## Verification

- The rule: the time boundary, the skipped names, the order, the cap.
- The walk on a real folder: hidden folders, `node_modules`, links, depth and entry limits.
- The run view: each file opens with the folder as base; the folder button; nothing written; more than listed; not shown mid-build.
- In a browser on the test server, a finished review build listed only `contract.proposed.txt` (not the sample placed before it started); clicking opened it in the Files view, and back returned to the run.
