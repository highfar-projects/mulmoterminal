// Does this server need a SECOND listener on loopback? (#1834)
//
// Everything this server spawns reaches back to it over loopback, and none of those callers can
// be told otherwise: a claude session's hooks curl `http://localhost:<port>/api/hook`, its GUI MCP
// url is `http://127.0.0.1:<port>/api/mcp/...`, a grid cell's url is baked into the user's OWN
// `.mcp.json` on disk, the muse bridge builds its origin from an argv port, and two routes here
// call this same server over HTTP. Eight places, all resting on one assumption.
//
// `MULMOTERMINAL_HOST=<a specific address>` breaks that assumption, because binding ONE address
// means loopback is no longer served — so every one of those callers gets ECONNREFUSED, which is
// the reported symptom: hooks failing on every tool call, and a GUI MCP stuck on "still
// connecting".
//
// The fix restores the assumption rather than rewriting the eight callers. That matters beyond
// tidiness, and the alternative is worth recording because it looks obvious and is not:
//
//   Pointing the sessions at the bound address instead trades ECONNREFUSED for 403. A hook is
//   `curl`, which sends no Origin, and `isAllowedOrigin` trusts an Origin-less request only when
//   the PEER is loopback — a local process reaching us on `192.168.64.1` has peer
//   `192.168.64.1` (measured), so it is refused. Making that work means widening the one
//   predicate standing between a visited web page and the user's terminal, AND a migration for
//   the urls already written into users' config files. Serving loopback again needs neither.
//
// It widens nothing: loopback is reachable only from this machine, and it is what an untouched
// install already serves. The operator asked to ADD an interface, not to remove that one.
import { isLoopbackAddress } from "./loopback.js";

/** What the OS says the primary listener bound — `server.address()` — and nothing else. Asking
 *  after the fact rather than classifying `MULMOTERMINAL_HOST` is the rule loopback.ts already
 *  states: `localhost`, `127.1` and `127.000.000.001` all mean loopback, and `localhost` can be
 *  pointed elsewhere by a hosts file, so only the resolved answer covers every spelling. */
export type BoundAddress = string | { address: string } | null;

// The address the second listener takes, and the only one worth taking: it is what our own
// callers DIAL. Six of the eight write `127.0.0.1` literally, and the two that write `localhost`
// reach it by falling back to v4 when v6 refuses. Nothing here dials `::1`, so serving it would
// answer a question nobody asks.
const V4_LOOPBACK = "127.0.0.1";

// `0.0.0.0` is the v4 wildcard, so it serves the v4 loopback by definition — no kernel setting
// changes that, and nothing more is needed.
const V4_WILDCARD = "0.0.0.0";

// `::` is the one genuinely ambiguous bind. It usually accepts v4 as well, but a Linux kernel with
// `net.ipv6.bindv6only=1` makes it v6-only, and there the fixed 127.0.0.1 urls stay unreachable
// (Codex on #1838).
//
// Rather than guess which kind of kernel this is, ATTEMPT the bind and read the answer: holding
// `[::]:P` dual-stack is what makes `127.0.0.1:P` unavailable, so EADDRINUSE PROVES the primary
// already covers loopback — and if it binds instead, that kernel did not, and the gap just closed.
const V6_WILDCARD = "::";

/** Whether the primary bind already answers on `127.0.0.1` for certain. The family distinction is
 *  the whole point and is easy to lose: `isLoopbackAddress("::1")` is true and correct, yet a
 *  server bound to `::1` REFUSES a client dialing 127.0.0.1 (measured) — which is why
 *  `MULMOTERMINAL_HOST=localhost` is broken today, since it resolves to `::1` while the GUI MCP
 *  url says `127.0.0.1`. */
const servesV4Loopback = (address: string): boolean => isLoopbackAddress(address) && !address.includes(":");

export interface LoopbackPlan {
  address: string;
  /**
   * Whether EADDRINUSE is a fine outcome rather than something to warn about.
   *
   * True only under a wildcard primary, where the port being taken is the primary itself and
   * therefore proof that loopback is already served. Warning there would fire on every correct
   * dual-stack boot, which is how an operator learns to ignore the warning that means something.
   */
  inUseIsFine: boolean;
}

/**
 * How to serve `127.0.0.1` alongside the primary bind, or null when the primary already does.
 */
export function loopbackListenPlan(bound: BoundAddress): LoopbackPlan | null {
  // A string address is a pipe or a UNIX socket, and null is "not listening" — neither is a
  // network bind this can reason about, and neither is reachable by a url a session would build.
  if (bound === null || typeof bound === "string") return null;
  if (bound.address === V4_WILDCARD || servesV4Loopback(bound.address)) return null;
  return { address: V4_LOOPBACK, inUseIsFine: bound.address === V6_WILDCARD };
}

export interface PrimaryListener {
  address(): BoundAddress;
}

/** Only what this needs from the second server, so `http.Server` satisfies it structurally and a
 *  test can hand over a recorder without a cast. */
export interface LoopbackListener {
  once(event: "error", handler: (err: NodeJS.ErrnoException) => void): unknown;
  listen(port: number, host: string, onListening: () => void): unknown;
}

/**
 * Serve loopback as well, when the primary bind did not.
 *
 * BEST EFFORT, and deliberately not fatal: the operator asked for the address they named, and
 * that one is already listening by the time this runs. Failing the boot because the extra one
 * could not bind would turn a degraded setup into no setup at all — so it warns, naming the
 * symptom rather than the errno, and carries on.
 */
export function startLoopbackListener(primary: PrimaryListener, loopback: LoopbackListener, port: string | number): void {
  const plan = loopbackListenPlan(primary.address());
  if (plan === null) return;
  loopback.once("error", (err: NodeJS.ErrnoException) => {
    if (plan.inUseIsFine && err.code === "EADDRINUSE") return;
    console.warn(
      `\x1b[33m[bind]\x1b[0m could not also listen on ${plan.address}:${port} (${err.code ?? err.message}) — this machine's own sessions reach the server over loopback, so hooks and the GUI MCP will fail until it is free.`,
    );
  });
  loopback.listen(Number(port), plan.address, () => {
    console.log(`[bind] also listening on ${plan.address}:${port} so this machine's own sessions can reach the server`);
  });
}
