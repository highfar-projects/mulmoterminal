// What a terminal emulator sends back on the INPUT channel without anyone typing.
//
// xterm.js answers the application's own queries there: device attributes, the foreground and
// background colours, the cursor position. It also reports mouse movement and focus changes, both
// of which the running TUI asked for. All of it arrives exactly as a keystroke does.
//
// That matters to anything asking "has the user typed since this question appeared?"
// (server/session/write-to-session.ts). Counting these replies meant an answer from the question
// pane was refused after any attach, resize or theme read — measured, not guessed: a single button
// press was preceded by `ESC[?1;2c`, `ESC[>0;276;0c` and two OSC colour replies (#1693).
//
// Enumerated rather than inverted, because the other side of the line is "anything a person could
// have typed", and that includes every escape sequence a keyboard produces (`ESC O B` is Down).
const ESC = "\u001b";
const BEL = "\u0007";

const REPLIES: RegExp[] = [
  new RegExp(`${ESC}\\[<\\d+;\\d+;\\d+[Mm]`, "g"), // mouse, SGR — the mode this app enables
  new RegExp(`${ESC}\\[M[\\s\\S]{3}`, "g"), // mouse, X10 (payload is three raw bytes)
  new RegExp(`${ESC}\\[[IO]`, "g"), // focus in / out
  new RegExp(`${ESC}\\[\\?[\\d;]*c`, "g"), // primary device attributes
  new RegExp(`${ESC}\\[>[\\d;]*c`, "g"), // secondary / tertiary device attributes
  new RegExp(`${ESC}\\[\\d+;\\d+R`, "g"), // cursor position report
  new RegExp(`${ESC}\\][^${ESC}${BEL}]*(?:${BEL}|${ESC}\\\\)`, "g"), // OSC replies (colours, title, …)
];

/** Is this chunk terminal replies and nothing else? An empty chunk is not — nothing to excuse. */
export const isTerminalReplyOnly = (data: string): boolean => data.length > 0 && REPLIES.reduce((rest, pattern) => rest.replace(pattern, ""), data) === "";
