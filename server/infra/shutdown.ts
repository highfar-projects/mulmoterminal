// How this process ends, in one place.
//
// The whisper sidecar is a spawned child that won't die with the parent on a signal, and adding a
// signal listener suppresses Node's default termination — so the sidecar has to be killed and the
// exit made explicit. `exit` covers the normal-return path, where no signal is involved.
//
// It lives here rather than at the foot of index.ts because it is about to have a second caller:
// stopping MulmoTerminal from the browser (#1820) has to run THIS path and not a second one that
// drifts from it — the guarantee a user is owed is that the button does what Ctrl+C does.
//
// The exit is ASYNC now, and that is the fix for #2161: the session registry's appends are
// fire-and-forget, `process.exit()` runs no pending microtask, and a burst queued just before
// Ctrl+C was therefore lost whole — measured at 0 of 20 lines, with the file never created. The
// wait is capped, because a disk that has stopped answering must not turn Ctrl+C into a hang.
//
// `exit` cannot wait — the event loop is already over by then — so it stays synchronous and
// drains nothing. That is why the signal path is the one that matters: it is the path Ctrl+C and
// the browser's stop button both take.
import { stopWhisperSidecar } from "../backends/whisper.js";
import { drainPersistQueues } from "../session/persist-drain.js";

const SIGNALS = ["SIGINT", "SIGTERM"] as const;

export function installShutdownHandlers(): void {
  process.once("exit", stopWhisperSidecar);
  for (const signal of SIGNALS) {
    // `once`, not `on`, and that now carries a second guarantee worth stating: after the handler
    // fires the listener is gone, so Node's default action is restored and a SECOND Ctrl+C during
    // the drain terminates immediately (measured: exit 130). Switching this to `on` would make the
    // server unkillable for the length of the cap.
    //
    // Voided rather than returned: a promise handed to a void-returning callback is what
    // `no-misused-promises` is about, and the rule is right — a rejection there would be
    // unhandled. `stopAndExit` cannot reject, and a spec observes it by flushing instead.
    process.once(signal, () => {
      void stopAndExit();
    });
  }
}

/** Kill the sidecar first: it is synchronous, and it must not outlive us whether or not the drain
 *  finishes. Then flush what is owed to disk, under a cap, and go. */
async function stopAndExit(): Promise<void> {
  // Whatever the sidecar does, we exit. Before the drain this function was two statements and a
  // throw took the process down with it; now a throw would reject a promise nobody awaits and
  // leave a process with its default termination suppressed — a server that ignores Ctrl+C.
  try {
    stopWhisperSidecar();
  } catch (e) {
    console.warn(`[shutdown] the whisper sidecar did not stop cleanly: ${e instanceof Error ? e.message : String(e)}`);
  }
  const drained = await drainPersistQueues();
  if (!drained) console.warn("[shutdown] gave up waiting for queued session state to reach disk; some of it is lost");
  process.exit(0);
}
