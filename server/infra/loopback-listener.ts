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

/** What the OS says the primary listener bound — `server.address()` — and nothing else. Asking
 *  after the fact rather than classifying `MULMOTERMINAL_HOST` is the rule loopback.ts already
 *  states: `localhost`, `127.1` and `127.000.000.001` all mean loopback, and `localhost` can be
 *  pointed elsewhere by a hosts file, so only the resolved answer covers every spelling. */
export type BoundAddress = string | { address: string } | null;

// What our own callers DIAL. Six of the eight write `127.0.0.1` literally, and the two that write
// `localhost` reach it by falling back to v4 when v6 refuses.
const V4_LOOPBACK = "127.0.0.1";

// This used to say `Nothing here dials ::1, so serving it would answer a question nobody asks`.
// That premise was true of the SPAWNED callers above and false of the one caller it did not count:
// the user's BROWSER, which is sent to `http://localhost:<port>` because that is the origin their
// grid layout and settings are filed under (#1889).
//
// `localhost` resolves to both loopbacks, and measured on Chrome 152 / macOS, the browser tries
// `::1` FIRST — with `OURS-v4` on `127.0.0.1` and a stranger on `[::1]`, the stranger is what
// loads. So an unserved `::1` is not a gap nobody reaches; it is an address anything on this
// machine can take to receive our users' browser under our origin, with the `localStorage` that
// origin holds. Serving it is what makes `localhost` mean this server by construction rather than
// by timing (#1893).
const V6_LOOPBACK = "::1";

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

/** Whether the primary bind already answers on `127.0.0.1` for certain — the ONE address local
 *  clients dial, since `guiMcpUrlTemplate` and the hooks write it as a literal.
 *
 *  The family distinction is the whole point and is easy to lose: `isLoopbackAddress("::1")` is
 *  true and correct, yet a server bound to `::1` REFUSES a client dialing 127.0.0.1 (measured) —
 *  which is why `MULMOTERMINAL_HOST=localhost` was broken, since it resolves to `::1` while the
 *  GUI MCP url says `127.0.0.1`.
 *
 *  And the SAME argument rules out the rest of 127/8. This asked `isLoopbackAddress(address) &&
 *  !address.includes(":")`, which said yes to `127.0.0.2` — but a server bound there refuses
 *  127.0.0.1 exactly as the `::1` one does, so no secondary listener was planned and the clients
 *  that dial the FIXED endpoint could not reach it. Only the literal address answers for itself.
 *
 *  Scoped deliberately: something dialing `127.0.0.2` would be served fine. What breaks is the
 *  side that writes the address as a literal, which is every GUI MCP client. Whether such an
 *  address can be bound at all is a separate, platform-dependent question — macOS carries only
 *  127.0.0.1 on lo0, Linux the whole block — while the address MATCHING above is neither. */
const servesV4Loopback = (address: string): boolean => address === V4_LOOPBACK;

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
  /** What this listener is FOR, which is what decides the warning when it cannot be taken. The
   *  two failures look identical in the log and are nothing alike to the person reading it. */
  reason: LoopbackReason;
}

/** `sessions`: hooks and the GUI MCP dial `127.0.0.1` as a literal (#1834).
 *  `browser`: the user's browser is sent to `localhost`, which prefers `::1` (#1889). */
export type LoopbackReason = "sessions" | "browser";

const WARNING_TEXT: Record<LoopbackReason, string> = {
  sessions: "this machine's own sessions reach the server over loopback, so hooks and the GUI MCP will fail until it is free.",
  browser:
    "the browser opens http://localhost:<port>, which resolves here first — while something else holds it, that page is somebody else's server under this app's saved settings. Stop the other process, or open the address the launcher printed.",
};

/** Whether the primary bind already answers on `::1`.
 *
 *  A v6 wildcard always covers the v6 loopback — the `bindv6only` question that makes `::` awkward
 *  for V4 does not arise here, because that setting decides whether a `::` socket ALSO takes v4,
 *  never whether it takes v6. So unlike the v4 side, this needs no attempt-and-read. */
const servesV6Loopback = (address: string): boolean => address === V6_LOOPBACK || address === V6_WILDCARD;

/**
 * Which loopback addresses this server must take for itself, beyond whatever the primary bound.
 *
 * TWO questions, not one, and they are answered together only because the mechanism is shared:
 *
 *   - `127.0.0.1` — because everything this server SPAWNS dials it as a literal (#1834). Missing
 *     it breaks hooks and the GUI MCP.
 *   - `::1` — because the user's BROWSER is sent to `localhost`, which prefers it (#1889). Missing
 *     it lets anything on this machine answer for our origin.
 *
 * Each plan carries its own `reason` so the warning can name the right symptom. One text for both
 * would tell whoever is looking at a broken hook about browser origins, or the reverse.
 *
 * Returns at most one plan per address, and never more than two — pinned by a spec, because
 * `startLoopbackListeners` hands plan `i` to spare server `i` and index.ts creates exactly two.
 */
export function loopbackListenPlans(bound: BoundAddress): LoopbackPlan[] {
  // A string address is a pipe or a UNIX socket, and null is "not listening" — neither is a
  // network bind this can reason about, and neither is reachable by a url a session would build.
  if (bound === null || typeof bound === "string") return [];
  const { address } = bound;
  const plans: LoopbackPlan[] = [];
  if (address !== V4_WILDCARD && !servesV4Loopback(address)) {
    plans.push({ address: V4_LOOPBACK, inUseIsFine: address === V6_WILDCARD, reason: "sessions" });
  }
  // No `inUseIsFine` counterpart here: the only bind that could already hold `[::1]:P` is one that
  // serves the v6 loopback, and those return no plan at all. So EADDRINUSE means somebody else.
  if (!servesV6Loopback(address)) {
    plans.push({ address: V6_LOOPBACK, inUseIsFine: false, reason: "browser" });
  }
  return plans;
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

const START_TEXT: Record<LoopbackReason, string> = {
  sessions: "so this machine's own sessions can reach the server",
  browser: "so http://localhost:<port> can only mean this server",
};

function startOne(loopback: LoopbackListener, plan: LoopbackPlan, port: string | number): void {
  loopback.once("error", (err: NodeJS.ErrnoException) => {
    if (plan.inUseIsFine && err.code === "EADDRINUSE") return;
    console.warn(`\x1b[33m[bind]\x1b[0m could not also listen on ${plan.address}:${port} (${err.code ?? err.message}) — ${WARNING_TEXT[plan.reason]}`);
  });
  loopback.listen(Number(port), plan.address, () => {
    console.log(`[bind] also listening on ${plan.address}:${port} ${START_TEXT[plan.reason]}`);
  });
}

/**
 * Serve the loopback addresses the primary bind did not.
 *
 * BEST EFFORT, and deliberately not fatal: the operator asked for the address they named, and
 * that one is already listening by the time this runs. Failing the boot because an extra one
 * could not bind would turn a degraded setup into no setup at all — so it warns, naming the
 * symptom rather than the errno, and carries on. A machine with no IPv6 lands here with
 * `EADDRNOTAVAIL` and is fine: `localhost` is v4-only there, so nothing was at stake.
 *
 * Plan `i` goes to spare `i`. The spares are interchangeable — index.ts builds them all from the
 * same app — so this needs no matching by address, only enough of them. Being handed too few is
 * a wiring mistake rather than a runtime condition, and it would otherwise drop a listener in
 * silence, so it says so.
 */
export function startLoopbackListeners(primary: PrimaryListener, spares: readonly LoopbackListener[], port: string | number): void {
  const plans = loopbackListenPlans(primary.address());
  plans.forEach((plan, i) => {
    const spare = spares[i];
    if (spare === undefined) {
      console.warn(`\x1b[33m[bind]\x1b[0m no spare server for ${plan.address}:${port} — ${WARNING_TEXT[plan.reason]}`);
      return;
    }
    startOne(spare, plan, port);
  });
}
