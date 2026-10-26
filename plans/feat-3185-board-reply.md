# feat: answer and instruct a cell from the board (#3185)

Fifth step of the experimental board (#3172). The detail panel lets you read a cell's screen and answer it.

## Decisions

- **Free text only, no key buttons.** Chosen by the maintainer. A permission prompt (`1. Yes / 2. No`)
  is answered in the terminal, and the panel says so on a waiting cell.
- **Question buttons only when `questionPaneEnabled` is on.** The board reuses `QuestionPane` and the
  question routes, so with the switch off nothing is asked for and nothing is offered, exactly as in
  the grid.
- **No new judgement about bytes.** The reply goes through `sendToSession`, the host's wiring of the
  phone's `createTerminalInputSender`: control bytes stripped, bracketed paste, Claude's trailing
  space, and a separate Enter. Unlike the phone, it does NOT clear the input box first, so a draft
  typed in the cell is never discarded. A forgotten draft is submitted together with the reply
  instead, which is the trade `session-input.ts` already documents.
- **The reply box is on every cell, not only waiting ones**, so the board can give an idle or working
  agent its next instruction (the original #3172 request).

## Server

- `server/routes/terminalReply.ts` (pure): `readReplyRequest` refuses a malformed session id, missing
  or non-string text, text with nothing printable after sanitising (400), and text over
  `REPLY_MAX_CHARS` (413).
- `server/routes/terminal-reply-routes.ts`:
  - `GET /api/terminal/:sessionId/screen` answers `{ screen }` from `captureTerminalScreen`, and 404
    when the host does not hold the session. Existence is `sessionExistsHere`, exported from
    `hostBindings.ts`, which compares names exactly because tmux resolves a target by prefix.
  - `POST /api/terminal/:sessionId/reply` checks the origin itself as well as through the central
    gate. A sender rejection (no live terminal here) is a 409 carrying its reason.
- Mounted in `app-routes.ts`. `outputBufferLimit` is now passed in from `index.ts`, as the other
  capture callers already get it.

## UI

- `GithubBoardCellReply.vue`, one per cell in the panel:
  - It reads the screen and the open question when the cell starts waiting, or on the screen button.
  - Sending clears the box only once the host accepted the line; a refusal keeps the text and shows
    the reason.
  - It re-reads the screen and the question shortly after a reply or an answer.
- `QuestionPane.vue` gains `embedded`, which takes the panel's width and hides its expand and close
  buttons. Without the prop, its classes and controls are exactly as before.
