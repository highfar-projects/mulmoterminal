# feat: show PDF, video and audio in the Files pane (#2674, parts 1, 2 and 4)

## Why

The pane read every file but a raster image as text first. The text route checks size before
anything else, so a PDF, video or audio file over the edit cap came back 413 — and 413 threw into
`fileError`, a red line with no Open in OS. Under the cap it was 415, "not text", and still showed
nothing. A path to one of these clicked in a terminal skipped the pane for a browser tab.

## Change

- `fileMediaKind(name)` (`src/components/filePreviewKind.ts`) replaces `isRasterImage`: `image`,
  `pdf`, `video`, `audio`, or null — asked of the same content-type table the raw route answers from.
- `useOpenFile`: every media kind takes the image path (read the version only, never the text), and
  `readText` treats 413 like 415 — the "not text" panel with Open in OS, not a thrown error.
- `FilesMediaView.vue` draws the kind from `rawFileSrc`: `<img>`, a PDF `<iframe>` with no `sandbox`
  attribute (the raw route leaves a PDF unsandboxed because WebKit draws nothing in an opaque
  frame; a tab opened it the same way), `<video controls>`, `<audio controls>`. The raw route
  answers Range, so seeking does not fetch the file whole.
- `isPaneViewable` and `useRequestedOpen` ask `fileMediaKind`, so a terminal click on a PDF or video
  opens in the pane when one is up; with no pane it still goes to a tab.

## Containment

Unchanged: the same raw route and `?cwd=` rule images already used (`docs/file-surfaces.md`). Both
surfaces that mount `FilesPane` (right pane, full-screen `/files`) get it.

## Left out

- The size cap on the raw route — #2714.
- The version route still answers 413 over the edit cap, so a large media file shows with no version
  (and the browser logs that 413), exactly as a large image did.
