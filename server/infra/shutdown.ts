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

export function installShutdownHandlers(): void {
  process.once("exit", stopWhisperSidecar);
  for (const signal of SIGNALS) {
    process.once(signal, () => {
      stopWhisperSidecar();
      process.exit(0);
    });
  }
}
