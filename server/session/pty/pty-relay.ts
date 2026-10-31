// The wire between a spawned PTY and its WebSocket: output forwarded and buffered, exit forwarded
// and reaped. Identical for every first-class agent — the only thing that differed between the
// codex and antigravity copies was the word in the log line — so it lives here rather than being
// pasted into each new spawner. The two shell ptys (a launcher chip, a bot job) are the same wire
// with one more difference of that kind: their entry says `shell`, their log says which one.
//
// NOT shared with claude's spawner: that one drives hooks, transcripts and the draft injector off
// the same stream, and folding those in would make this the thing it exists to avoid. If a second
// agent ever needs one of them, move it here then.
import { reportPtyExit } from "./pty-exit.js";
import { wireBufferedOutput } from "./output-relay.js";
import { ptyExitLine } from "./pty-exit-log.js";
import type { PtyEntry } from "../types.js";

export interface PtyRelayDeps {
  outputBufferLimit: number;
  reap: (sessionId: string) => void;
}

export interface PtyRelayOptions {
  /** The seed-injection tap: a spawner that types into the TUI watches the same stream for its
   *  ready-marker rather than attaching a second onData listener. */
  onOutput?: ((data: string) => void) | undefined;
  /** The word the exit line uses when it is not the entry's agent: a shell pty records `shell` for
   *  the phone's sake, while its start line said `launcher` or `bot-job`, and the two are read
   *  together. */
  loggedAs?: string;
}

/** `spawnedAtMs` is carried in rather than read here: the exit line's most useful field is how long
 *  the process lived, and an agent that dies inside the startup window never started (#1078). */
export function wireAgentPtyRelay(entry: PtyEntry, sessionId: string, spawnedAtMs: number, deps: PtyRelayDeps, options: PtyRelayOptions = {}): void {
  const output = wireBufferedOutput(entry, deps.outputBufferLimit, options.onOutput);
  entry.term.onExit(({ exitCode, signal }) => {
    const lifetimeMs = Date.now() - spawnedAtMs;
    console.log(ptyExitLine({ agent: options.loggedAs ?? entry.agent ?? "agent", exitCode, signal, lifetimeMs, cwd: entry.cwd, sessionId }));
    output.flush(); // a queued batch must not arrive after the exit frame
    // See spawn-claude's copy: a tmux client killed from outside is not a finished session (#1496).
    reportPtyExit(sessionId, entry, { exitCode, signal, lifetimeMs }, deps.reap);
  });
}
