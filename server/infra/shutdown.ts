// How this process ends, in one place.
//
// The whisper sidecar is a spawned child that won't die with the parent on a signal, and adding a
// signal listener suppresses Node's default termination — so the sidecar has to be killed and the
// exit made explicit. `exit` covers the normal-return path, where no signal is involved.
//
// It lives here rather than at the foot of index.ts because it has more than one caller:
// stopping MulmoTerminal from the browser (#1820) has to run THIS path and not a second one that
// drifts from it — the guarantee a user is owed is that the button does what Ctrl+C does. So does
// a supervisor that spawned this process (scripts/dev-server.mjs, bin/mulmoterminal.js) and wants
// to stop it gracefully over the IPC channel it already has: `child.kill()` has no real SIGTERM to
// deliver on Windows — libuv maps it straight to TerminateProcess — so a cross-process signal
// never reaches the handlers below there, and IPC is the one channel that behaves the same on
// every platform.
import { stopWhisperSidecar } from "../backends/whisper.js";
import { isRecord } from "../../common/isRecord.js";

const SIGNALS = ["SIGINT", "SIGTERM"] as const;

// A signal must still feel instant on a machine whose disk is genuinely stuck — losing the last
// few milliseconds of one queued write is a smaller failure than a terminal that no longer closes.
const DRAIN_TIMEOUT_MS = 2000;

// Give registry.ts's fire-and-forget appenders (session→account, session→custom-agent, memos, …)
// a real chance to land on disk before the process ends. Without this, `process.exit` right after
// a signal abandons whatever was still mid-append — the write registry.ts's own comment warns
// about — and the NEXT boot's hydration has nothing to read back for it.
function drain(pendingWrites: () => Promise<unknown>[]): Promise<unknown> {
  return Promise.race([Promise.all(pendingWrites()), new Promise((resolve) => setTimeout(resolve, DRAIN_TIMEOUT_MS).unref())]);
}

/** The one sequence every shutdown trigger below ends in. Exported so a caller that already has
 *  its own reason to stop (none exist yet, but a route mirroring shutdown-routes.ts's browser
 *  button would) can run the identical path without going through a signal at all. */
export async function gracefulExit(pendingWrites: () => Promise<unknown>[]): Promise<void> {
  await drain(pendingWrites);
  stopWhisperSidecar();
  process.exit(0);
}

// What a supervisor sends over the IPC channel `stdio: […, "ipc"]` already opens, when it wants
// this exact sequence but cannot reach it any other way. Kept to one field, the same shape
// announce-listening.ts's own message going the other direction uses `type` for.
const isShutdownMessage = (message: unknown): boolean => isRecord(message) && message.type === "shutdown";

export function installShutdownHandlers(pendingWrites: () => Promise<unknown>[]): void {
  process.once("exit", stopWhisperSidecar);
  for (const signal of SIGNALS) {
    process.once(signal, () => {
      void gracefulExit(pendingWrites);
    });
  }
  // Not `once`: a supervisor's IPC channel can carry more than this one message shape, and only
  // the first thing to arrive on it would earn a listener under `once`.
  process.on("message", (message: unknown) => {
    if (isShutdownMessage(message)) void gracefulExit(pendingWrites);
  });
}
