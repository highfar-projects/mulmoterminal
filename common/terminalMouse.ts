// Mouse reports a terminal application asked for, arriving from the browser as ordinary input.
//
// Claude Code's dialog turns mouse tracking on, so a click anywhere in the terminal — or a wheel
// nudge — sends bytes down the same channel as typing. Anything watching "has the user typed since
// this question appeared?" (server/session/write-to-session.ts) must not count those, or reaching
// for the mouse before answering from the pane refuses every answer (#1693).
//
// A mouse click that actually answers the dialog is still caught, by a stricter check: the dialog
// closes, and the answer names a toolUseId the host no longer reports as open.
//
// Two encodings reach us. SGR (`ESC [ < b ; x ; y M|m`) is what xterm.js sends in every mode this
// app enables; X10 (`ESC [ M` plus three raw bytes) is the older one, kept because a session can be
// attached to anything.
// eslint-disable-next-line no-control-regex -- ESC is the point: these ARE escape sequences
const SGR_MOUSE = /\u001b\[<\d+;\d+;\d+[Mm]/g;
// eslint-disable-next-line no-control-regex -- same, and the X10 payload is three RAW bytes
const X10_MOUSE = /\u001b\[M[\s\S]{3}/g;

/** Is this chunk mouse reports and nothing else? Empty input is not — there is nothing to ignore. */
export const isMouseReportOnly = (data: string): boolean => data.length > 0 && data.replace(SGR_MOUSE, "").replace(X10_MOUSE, "") === "";
