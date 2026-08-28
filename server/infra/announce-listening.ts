// Saying "this server is listening" — after it holds every address it told anyone to use.
//
// Out of index.ts because the ORDER here is load-bearing and index.ts is where an ordering
// constraint goes to be forgotten: the file is a boot script, and a line moved for tidiness reads
// like a line moved for nothing. Here the two steps are one function with the reason attached.
import type { LoopbackListener, LoopbackOutcome, PrimaryListener } from "./loopback-listener.js";
import { startLoopbackListeners } from "./loopback-listener.js";

/** Only what this needs from the process, so a test hands over a recorder rather than forking. */
export interface IpcParent {
  connected: boolean;
  send?: (message: unknown, handle: undefined, options: undefined, callback: () => void) => unknown;
}

export interface ListeningMessage {
  type: "listening";
  port: number;
  address: string | null;
  v6LoopbackServed: boolean;
}

/** The message a parent gets, built where the answers are known.
 *
 *  `address` is the one the KERNEL reported, not `BIND_HOST`: that can be a NAME — `localhost`
 *  resolves to `::1` here and `127.0.0.1` elsewhere — and a launcher that guesses wrong polls a
 *  stranger and calls it ready (#1876).
 *
 *  `v6LoopbackServed` is the second thing only this side can answer. The launcher probes `::1`
 *  before this process exists, so a process claiming `[::1]:<port>` DURING the boot is invisible
 *  to it — and the launcher would then send a browser to `localhost`, which prefers `::1`
 *  (measured on Chrome), straight into that process under this app's origin. Reported rather than
 *  merely logged for exactly that reason (Codex, PR #1903). */
export const listeningMessage = (port: number, address: string | null, outcome: LoopbackOutcome): ListeningMessage => ({
  type: "listening",
  port,
  address,
  v6LoopbackServed: outcome.v6LoopbackServed,
});

/**
 * Take the loopback addresses the primary bind did not, and only THEN announce.
 *
 * The launcher acts on this message — it prints the banner and opens the browser at
 * `http://localhost:<port>` — so announcing before `::1` is held invites the browser to an
 * address this process has not claimed yet. Awaiting the binds first is what closes that.
 *
 * The dev supervisor (scripts/dev-server.mjs) resets its crash count on this message, not on how
 * long the process lived, because elapsed time never proved the port was reached (#1735). It keys
 * on `type` alone, so new fields are additive.
 *
 * Three guards on the send, and none is decoration. `send` is undefined unless a parent opened an
 * IPC channel, so this is a no-op under `npx mulmoterminal`. `connected` is the one that matters:
 * after the parent disconnects, `send` STAYS a function, and calling it raises
 * ERR_IPC_CHANNEL_CLOSED **asynchronously** — measured, it lands as an uncaughtException and kills
 * the process, so neither `?.` nor a try/catch stops it. That is reachable: Ctrl+C on the
 * supervisor while this server is still in its ~3s of setup. The callback catches the same error
 * for a channel that closes between the check and the write.
 */
export async function announceListening(
  primary: PrimaryListener,
  spares: readonly LoopbackListener[],
  port: number,
  boundAddress: string | null,
  parent: IpcParent,
): Promise<void> {
  const outcome = await startLoopbackListeners(primary, spares, port);
  if (!parent.connected) return;
  parent.send?.(listeningMessage(port, boundAddress, outcome), undefined, undefined, () => {});
}
