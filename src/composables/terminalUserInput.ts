// Whether a chunk heading for the PTY means "the user typed something", as opposed to the
// terminal telling the app where the pointer went, that focus moved, or answering a query.
//
// Everything the terminal sends travels one channel, so "input arrived" and "the user typed" are
// NOT the same question — and code that needs the second one gets the first by default. A parked
// cell wakes on the user typing (#992): clicking it to read it must leave it parked, and clicking
// is exactly what a mouse-tracking app turns into input.
import { scanForUserInput } from "../../common/terminalReplies";
import { isMouseReport } from "./mouseReports";

// tmux queries a client every time one attaches, and xterm.js answers on this channel — so a cell
// reconnecting after its PTY was reaped would wake itself with nobody at the keyboard.
//
// xterm.js writes each reply in one onData call, so nothing here is ever split; a tail the scanner
// would hold as "still growing" is a whole keystroke instead — Alt+[ is exactly `ESC[`.
function isEmulatorReply(data: string): boolean {
  const { fromUser, pending } = scanForUserInput("", data);
  return !fromUser && pending === "";
}

export function isTypedInput(data: string): boolean {
  return !isMouseReport(data) && !isEmulatorReply(data);
}
