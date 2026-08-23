// Typing into a session from inside the host, for things the USER DID NOT ASK FOR.
//
// `createTerminalInputSender` is a factory because the phone's handlers are built from injected deps
// and tested that way. This is the same sender wired to the host's real tables, so a second caller
// does not get to decide again which bytes submit or which agent has a completion menu — judgements
// already made, once, in `terminalInput.ts` and `terminalSubmit.ts`.
//
// IT DOES NOT CLEAR THE INPUT BOX, and that is the one deliberate difference from the phone's
// sender. Clearing is a Ctrl-C, which throws away whatever the user has half-typed. The phone may do
// that because the user asked for that send and expects their text to be the only thing submitted
// (#572); nothing arriving on a stranger's schedule has that permission. What replaces it is
// waiting: `deliverable` in shared-app-watches.ts holds a line until the user has stopped typing.
//
// The residual, stated because it cannot be fixed from here: a draft left sitting in the box longer
// than that quiet period is submitted together with our line. The host cannot ask an agent's TUI
// whether its box is empty, so there is no check to make — only the choice between merging with a
// forgotten draft and destroying a live one, and merging is the one that loses nothing.
//
// ORDERING. Each sender keeps its own per-session chain, so a line from here and a line from the
// phone can in principle interleave as paste-paste-Enter-Enter on one PTY. It needs both within
// ~150ms of each other on the same session; the watch path additionally requires the user to have
// been silent for fifteen seconds, which is most of what would produce the phone's write. Left as
// it is rather than made global, because a shared chain broke the sender's own specs — see
// terminalInput.spec.ts, where senders are built per test.
import { ptys } from "./registry.js";
import { writeToSession } from "./write-to-session.js";
import { getTerminalSubmit } from "../config/config-routes.js";
import { createTerminalInputSender } from "../backends/remoteHost/terminalInput.js";
import { submitSequenceForAgent } from "../../common/terminalSubmit.js";

/** Paste a line into a session and submit it, resolving once the Enter has gone out.
 *  Rejects when the session has no live PTY in this process. */
export const sendToSession = createTerminalInputSender({
  writeToSession,
  submitSequence: (sessionId) => submitSequenceForAgent(ptys.get(sessionId)?.agent, getTerminalSubmit()),
  sessionAgent: (sessionId) => ptys.get(sessionId)?.agent,
});
