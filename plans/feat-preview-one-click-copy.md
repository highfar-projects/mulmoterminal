# One-click copy in the Preview (#3003)

## Goal

A Preview code block's copy button copies at once and shows a notice, as every other surface does
(#3000). The dialog from #2615 stays, but only for blocks that cannot be copied as they are.

## Decision and accepted risk

The user chose one-click over the confirm-first dialog. The Preview draws an unsanitised `.md`, so
its CSS can make a block look different from what is copied (#2615's findings). What is kept:

- the text still comes from the FILE (`/api/files/browse/code-block`), never from the page;
- the notice shows the first line and line count, so a reader can check before pasting;
- a block with characters a reader cannot see (`revealHidden`) goes to the dialog, which writes
  them out as `<U+…>`.

## Approach

- `src/components/previewCodeCopy.ts`: `directCopyText` (found and no hidden characters),
  `copiedNoticeFor`, and `writeClipboardLater`. The last one starts the write BEFORE the fetch, as a
  `ClipboardItem` holding the pending text — the shape Safari accepts for content that arrives after
  the press — and falls back to `writeText`.
- `usePreviewCodeBlock`: copy, then notice; dialog when there is no Clipboard API, the write is
  refused, the block is gone, or it has hidden characters.
- `PreviewCopiedNotice.vue`: a status pill at the bottom of the window, gone after a moment.
- Button label loses its trailing "…", since a press usually no longer opens anything.

## Measured

Chromium and WebKit (Playwright): a click inside a `sandbox="allow-scripts"` frame, a postMessage,
then a delay before the write. Chromium writes after a 2 s delay with both shapes. WebKit reports
success but its clipboard cannot be read back headless, so real Safari is unverified; a refusal
there falls back to the dialog rather than doing nothing.
