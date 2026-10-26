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
    The route first checks the request's **Host** with `createIsAllowedHost` (loopback plus the
    operator-named hostnames, the same list as the Origin check), because a DNS-rebound page reads a
    GET as same-origin with no Origin header. The older GETs that expose session content have the same
    exposure; that is a separate issue, not widened here.
  - `POST /api/terminal/:sessionId/reply` checks the origin itself as well as through the central
    gate. It **refuses when a question dialog is open at that moment** (409, `reason: question-open`),
    read from the tool-call history the hooks record whether or not the question pane is on. The host
    is the authority because a dialog can open after the page last asked. The browser's gate below is
    the earlier, friendlier half. A sender rejection (no live terminal here) is a 409 carrying its
    reason.
- Mounted in `app-routes.ts`. `outputBufferLimit` is now passed in from `index.ts`, as the other
  capture callers already get it.

## UI

- `GithubBoardCellReply.vue`, one per cell in the panel:
  - It reads the screen and the open question when the cell starts waiting, or on the screen button.
  - Sending clears the box only once the host accepted the line; a refusal keeps the text and shows
    the reason.
  - It re-reads the screen and the question shortly after a reply or an answer.
  - **The reply gate is a permitted list** (`src/components/boardReplyGate.ts`, pure). A reply goes
    only when the cell's dialog is known to be `none` and nothing else is writing. `unknown` (a lookup
    in flight, or a lookup that FAILED — `lookUpOpenQuestion` tells that apart from "nothing asked") and
    `open` keep it shut. With the question pane off, no dialog is tracked, as on the phone, except one
    already seen `open`, which stays open until the cell stops waiting. A cell that stops waiting is
    `none`. A question is not answered while a reply is being typed. Stated this way after three
    review rounds each found one more unsafe state to enumerate.
  - Nothing outlives the panel: after unmount no refresh is scheduled and no response in flight is
    applied.
  - `fetchOpenQuestion`, used by the grid, is now `lookUpOpenQuestion` with failures mapped to null. It
    was run beside the old body over 140 generated responses, with identical results; the property is
    kept in `test/src/composables/openQuestion.spec.ts`.
- `QuestionPane.vue` gains `embedded`, which takes the panel's width and hides its expand and close
  buttons. Without the prop, its classes and controls are exactly as before.
