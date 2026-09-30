# feat: copy a Preview code block without trusting the document (#2615)

## Why not a button that copies from the Preview
The Preview draws a `.md` nobody sanitised. It cannot run scripts, but its markup and CSS can hide
part of a block, show different characters, or lay a fake block over a real one (measured in #2613),
so text taken from the document can differ from what the reader saw — and the paste target here is
usually a shell.

## Decision (recorded on #2615)
The app shows the block, read from the FILE, in a dialog of its own, and copies from there.

## How
- Server (`server/files/previewCodeFence.ts`): marked's `code` renderer numbers every block it draws
  (`data-code-block`), coloured or not.
- Reporter script (`server/files/mdPreviewReporter.ts`, the one nonce'd script): a copy button on each
  numbered block posts `{kind: "code-block", index}`. Its accessible name arrives from the host with
  the answer to `ready`, in the app's language.
- Host: `useMdPreviewScroll` hands the index to `usePreviewCodeBlock`, which asks the server for block
  N (`/api/files/browse/code-block`, read-only like `/lines` — `/text` would rotate a backup on every
  press); the server takes it with `previewCodeBlocks` (`common/`, marked's lexer, same order as
  drawing). `PreviewCodeBlockDialog.vue` shows it and copies exactly that text.
- A text box does not draw every character as itself, so the dialog writes those out as `<U+XXXX>`
  with a warning (`common/hiddenCharacters.ts`): decided by Unicode property (Cc, Cf, Cn, Zs except
  space, Zl, Zp, Co, Default_Ignorable) plus a few blank glyphs and a lone CR; left alone are one
  selector/joiner inside an emoji and up to two ideographic spaces. Copy still copies the file's text.
- Character rules cannot cover every way LAYOUT hides text (newline runs; blanks one engine wraps and
  another hangs), so the dialog also measures its own box (`useContinuesBelow`) and shows a note while
  text lies below what is in view. This is the structural guard — do not drop it as redundant with the
  character rules. The box opens at the top (WebKit otherwise scrolls to the caret at the end).

## What a hostile `.md` can still do
Hide or fake the in-Preview button, or post a different number (a forged `data-code-block`). Either
way the dialog shows a real block from the file, whole, before anything is copied.

## Verification
- A generated-document spec renders through the real route and compares the drawn numbers and text
  with `previewCodeBlocks` (the property that ties the two counts together); breaking either count
  turns it red.
- Specs for the message check, the pure extraction, the host flow (latest press, file switched,
  missing, failed) and the dialog (copies what it shows; manual selection without a clipboard).
