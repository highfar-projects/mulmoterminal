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

/** Carries the ANSWER the launcher needs, not the inputs it would have to combine.
 *
 *  It said `v6LoopbackServed` for one iteration, and that was the wrong shape: `localhost`
 *  resolves to EITHER loopback, so the question "may a browser be sent there" needs both halves,
 *  and a wire that reports one half invites the reader to treat it as the whole (Codex, PR #1903).
 *  One field, answering the one thing the launcher decides. */
export interface ListeningMessage {
  type: "listening";
  port: number;
  address: string | null;
  localhostIsOurs: boolean;
}

/** The message a parent gets, built where the answers are known.
 *
 *  `address` is the one the KERNEL reported, not `BIND_HOST`: that can be a NAME — `localhost`
 *  resolves to `::1` here and `127.0.0.1` elsewhere — and a launcher that guesses wrong polls a
 *  stranger and calls it ready (#1876).
 *
 *  `localhostIsOurs` is the second thing only this side can answer. The launcher checks the
 *  loopbacks before this process exists, so anything claiming one DURING the boot is invisible to
 *  it — and the launcher would then send a browser to `localhost` straight into that process
 *  under this app's origin. Reported rather than merely logged for exactly that reason. */
export const listeningMessage = (port: number, address: string | null, outcome: LoopbackOutcome): ListeningMessage => ({
  type: "listening",
  port,
  address,
  localhostIsOurs: localhostIsOurs(outcome),
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
/**
 * The URL a HUMAN should be given, once the loopback binds have been attempted.
 *
 * `localhost` is the one to print — it is the origin the browser files its settings under
 * (#1889) — but ONLY once this server holds every address it resolves to. Printing it before the
 * `::1` outcome is known is the same defect as announcing readiness early, and it reaches further:
 * a direct `npm run server` has no launcher to correct it, so this line is all the operator has
 * (Codex, PR #1903).
 *
 * The fallbacks descend by what is still true: the v4 loopback if we hold it, otherwise the
 * address the kernel says we bound, which is the last thing that can be asserted at all.
 */
export function localBrowserUrl(port: number, boundAddress: string | null, outcome: LoopbackOutcome): string {
  if (localhostIsOurs(outcome)) return `http://localhost:${port}`;
  // Descending by what is still true. Naming the loopback we DID keep is better than naming the
  // bind, and naming the wrong one is the defect in miniature: with `::1` ours and `127.0.0.1`
  // lost, printing `127.0.0.1` sends the reader to the stranger by hand.
  if (outcome.v4LoopbackServed) return `http://127.0.0.1:${port}`;
  if (outcome.v6LoopbackServed) return withHost(port, "::1");
  if (boundAddress === null) return `http://127.0.0.1:${port}`;
  return withHost(port, boundAddress);
}

/** Built through `URL` so an IPv6 literal is bracketed: `http://::1:34567` is not a URL at all. */
function withHost(port: number, host: string): string {
  const url = new URL(`http://localhost:${port}`);
  url.hostname = host.includes(":") ? `[${host}]` : host;
  return url.origin;
}

/**
 * Whether `http://localhost:<port>` can only mean this server.
 *
 * BOTH loopbacks, and that is the correction Codex made twice over: `localhost` resolves to
 * `::1` and to `127.0.0.1`, clients differ on which they try first (Chrome prefers `::1`,
 * measured), and holding one of the two leaves the other free for anything on this machine to
 * answer with. Half an answer here is not a smaller guarantee, it is none.
 */
export const localhostIsOurs = (outcome: LoopbackOutcome): boolean => outcome.v4LoopbackServed && outcome.v6LoopbackServed;

/** Why the URL above is not `localhost`, or null when it is. Silence would leave an operator
 *  looking at an address they did not expect with nothing to search for — so it names the
 *  address that was lost, which is the one they have to go and free. */
export function notLocalhostReason(port: number, outcome: LoopbackOutcome): string | null {
  if (localhostIsOurs(outcome)) return null;
  const lost = [outcome.v4LoopbackServed ? null : `127.0.0.1:${port}`, outcome.v6LoopbackServed ? null : `[::1]:${port}`].filter((entry) => entry !== null);
  return `[bind] not printing http://localhost:${port} — something else holds ${lost.join(" and ")}, and a browser resolving localhost would reach it under this app's saved settings.`;
}

export async function announceListening(
  primary: PrimaryListener,
  spares: readonly LoopbackListener[],
  port: number,
  boundAddress: string | null,
  parent: IpcParent,
): Promise<void> {
  const outcome = await startLoopbackListeners(primary, spares, port);
  // AFTER the binds, for the same reason the IPC message is: this line is what a direct
  // `npm run server` hands its operator, and there is no launcher behind it to correct.
  console.log(`mulmoterminal running at ${localBrowserUrl(port, boundAddress, outcome)}`);
  const reason = notLocalhostReason(port, outcome);
  if (reason !== null) console.warn(`\x1b[33m${reason}\x1b[0m`);
  if (!parent.connected) return;
  parent.send?.(listeningMessage(port, boundAddress, outcome), undefined, undefined, () => {});
}
