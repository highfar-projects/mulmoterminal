// How this process ends, in one place.
//
// The whisper sidecar is a spawned child that won't die with the parent on a signal, and adding a
// signal listener suppresses Node's default termination — so the sidecar has to be killed and the
// exit made explicit. `exit` covers the normal-return path, where no signal is involved.
//
// It lives here rather than at the foot of index.ts because it is about to have a second caller:
// stopping MulmoTerminal from the browser (#1820) has to run THIS path and not a second one that
// drifts from it — the guarantee a user is owed is that the button does what Ctrl+C does.
import { stopWhisperSidecar } from "../backends/whisper.js";

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

export function installShutdownHandlers(pendingWrites: () => Promise<unknown>[]): void {
  process.once("exit", stopWhisperSidecar);
  for (const signal of SIGNALS) {
    process.once(signal, () => {
      void drain(pendingWrites).finally(() => {
        stopWhisperSidecar();
        process.exit(0);
      });
    });
  }
}
