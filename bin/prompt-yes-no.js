// A yes/no question that is allowed to go UNANSWERED (#2090).
//
// The launcher asks two questions on the way up, and both used to have exactly two endings. That
// is one ending short: a question can also never be answered, and when that happened the launcher
// waited for an answer that was never coming — measured at 10+ minutes on the reported machine,
// with the port never bound and nothing further logged.
//
// `process.stdin.isTTY` was the guard, and it asks the wrong thing. It answers "is there a
// terminal here", not "is there a person here" — and on Windows a wrapper that redirects stdout
// and stderr but leaves stdin alone gets a console it can never type into, so the terminal is real
// and the person is not. There is no test that reliably tells those apart, which is why this file
// does not try: it puts a DEADLINE on the answer instead, and a deadline needs to guess at
// nothing.
//
// Callers get three outcomes rather than a boolean, because "unanswered" is not "no". What it IS
// equal to is having had nobody to ask — every caller already decided that case, and routes this
// one to the same place. A person who closes the prompt is not that case; see askYesNo.
// See plans/fix-2090-unanswerable-prompt.md.
import { createInterface } from "node:readline";
import { saysYes } from "./cli-args.js";

/**
 * How long a question waits before nobody is considered to be there.
 *
 * Generous on purpose, because the two mistakes are not the same size. Too late costs a scripted
 * launch this much delay ONCE, and it then starts normally. Too early answers for a person who
 * was still reading the four lines above the prompt — and that one is not recoverable, because by
 * then the launch has gone the other way.
 */
export const ANSWER_DEADLINE_MS = 60_000;

/**
 * Ask `question` and resolve "yes", "no", or "unanswered".
 *
 * Only ONE thing is "unanswered", and it is the deadline passing: nobody is at the terminal that
 * readline is holding. That is the reported hang.
 *
 * A CLOSED prompt is "no", not "unanswered", and the difference decides whether a second server
 * starts. Every call site asks only when stdin is a TTY, so the input does not simply run out:
 * readline closes because the person at the terminal pressed Ctrl+C or Ctrl+D (or the terminal
 * itself went away, which signals the process as well). That is somebody ending the question, not
 * nobody being there — and "unanswered" routes to the no-terminal answer, which in
 * `confirmNoRunningInstance` is "start another one anyway". Before this function existed, both keys
 * ended the launch (readline drops the question callback on close, so nothing was ever started);
 * "no" keeps that, and says so with an exit code instead of by accident.
 *
 * Every dependency is injectable so each ending can be driven without a terminal or a real minute
 * passing.
 */
export function askYesNo(question, deps = {}) {
  const { input = process.stdin, output = process.stdout, deadlineMs = ANSWER_DEADLINE_MS, setTimer = setTimeout, clearTimer = clearTimeout } = deps;
  return new Promise((resolve) => {
    const readlineInterface = createInterface({ input, output });
    let deadlineTimer = null;
    let settled = false;
    // One outcome per call, whichever ending arrives first. `close` fires again from our own
    // close() below, and an answer that lands in the same tick as the deadline would otherwise
    // resolve twice — harmless for a promise, but it would also leave the timer running.
    //
    // An answer ends its own line, because Enter did. Any other ending leaves the cursor after
    // "[y/N] ", and the launcher's next line would be glued onto the prompt.
    const settle = (outcome, answered) => {
      if (settled) return;
      settled = true;
      if (deadlineTimer !== null) clearTimer(deadlineTimer);
      if (!answered) output.write("\n");
      readlineInterface.close();
      resolve(outcome);
    };
    readlineInterface.on("close", () => settle("no", false));
    readlineInterface.question(question, (answer) => settle(saysYes(answer) ? "yes" : "no", true));
    deadlineTimer = setTimer(() => settle("unanswered", false), deadlineMs);
  });
}
