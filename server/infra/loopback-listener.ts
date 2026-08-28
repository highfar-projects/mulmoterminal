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

import { createServer, type Server } from "node:net";

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
  /**
   * Whether an `EADDRINUSE` here PROVES the primary already serves this address, rather than
   * meaning a rival holds it.
   *
   * It was called `inUseIsFine`, and that name is what let the bug in: "fine" reads as "ignore
   * it", so the clash was classified `taken` and `localhost` was suppressed for a `::` bind that
   * owns both loopbacks (Codex/CodeRabbit, PR #1903). The clash is not something to tolerate —
   * it is the ANSWER, and the answer is `ours`.
   */
  inUseProvesPrimary: boolean;
  /** What this listener is FOR, which is what decides the warning when it cannot be taken. The
   *  two failures look identical in the log and are nothing alike to the person reading it. */
  reason: LoopbackReason;
}

/** `sessions`: hooks and the GUI MCP dial `127.0.0.1` as a literal (#1834).
 *  `browser`: the user's browser is sent to `localhost`, which prefers `::1` (#1889). */
export type LoopbackReason = "sessions" | "browser";

/**
 * What became of one loopback address.
 *
 * Three states and not a boolean, because "we did not get it" hides the distinction that decides
 * everything downstream. Only `EADDRINUSE` says somebody else is there; `EADDRNOTAVAIL` /
 * `EAFNOSUPPORT` say the address does not exist on this machine, and there `localhost` cannot
 * resolve to it at all — so nothing is at stake and avoiding `localhost` would be a lie told to
 * an IPv4-only host (Codex, PR #1903).
 *
 * `bin/cli-args.js` already states this rule for the port probe — "only EADDRINUSE answers the
 * question" — and this file was the one place that had not applied it.
 *
 *   `ours`   — the primary bind already answers here, or the extra listener took it
 *   `absent` — this machine has no such address; nothing can answer here, ever
 *   `taken`  — something else answers here
 */
export type LoopbackStatus = "ours" | "absent" | "taken";

/** Errnos that mean the address is not a thing on this machine, rather than not free. */
const ABSENT_CODES = new Set(["EADDRNOTAVAIL", "EAFNOSUPPORT"]);
const statusFromError = (err: NodeJS.ErrnoException): LoopbackStatus => (ABSENT_CODES.has(err.code ?? "") ? "absent" : "taken");

/** What the caller has to know once the extra listeners have been attempted. */
export interface LoopbackOutcome {
  /**
   * Whether this server answers on `::1` — either because the primary bind already did, or
   * because the extra listener took it.
   *
   * It exists to be REPORTED, not just logged. The launcher decides whether to send the browser
   * to `localhost`, and until this was reported it decided from a probe taken BEFORE the server
   * existed — so a process that claimed `[::1]:<port>` during the boot was invisible to it, and
   * the browser went to that process under this app's origin (Codex, PR #1903).
   */
  v6: LoopbackStatus;
  v4: LoopbackStatus;
}

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
export function loopbackListenPlans(bound: BoundAddress, v6WildcardTakesV4: boolean): LoopbackPlan[] {
  // A string address is a pipe or a UNIX socket, and null is "not listening" — neither is a
  // network bind this can reason about, and neither is reachable by a url a session would build.
  if (bound === null || typeof bound === "string") return [];
  const { address } = bound;
  const plans: LoopbackPlan[] = [];
  if (address !== V4_WILDCARD && !servesV4Loopback(address)) {
    // A clash proves the primary only where the primary CAN hold this address. `::` does on a
    // dual-stack kernel and does not under `net.ipv6.bindv6only=1`, and the difference is not a
    // detail: read the wrong way, an unrelated `127.0.0.1` listener is counted as ourselves and
    // `localhost` is advertised straight at it (Codex, PR #1903). So the caller MEASURES which
    // kind of kernel this is — see kernelV6WildcardTakesV4 — rather than assuming.
    plans.push({ address: V4_LOOPBACK, inUseProvesPrimary: address === V6_WILDCARD && v6WildcardTakesV4, reason: "sessions" });
  }
  // No `inUseProvesPrimary` counterpart here: the only bind that could already hold `[::1]:P` is
  // one that serves the v6 loopback, and those return no plan at all. So EADDRINUSE means
  // somebody else.
  if (!servesV6Loopback(address)) {
    plans.push({ address: V6_LOOPBACK, inUseProvesPrimary: false, reason: "browser" });
  }
  return plans;
}

/**
 * Does a `::` bind on THIS kernel also take the v4 loopback?
 *
 * `net.ipv6.bindv6only=1` makes `::` v6-only, and every guess about which kind of kernel this is
 * has been wrong somewhere — this file's history is a list of them. So it is measured, on a PORT
 * NOBODY ELSE IS USING: bind `[::]:0`, take the ephemeral port the kernel picks, and see whether
 * `127.0.0.1` on that port is now unavailable. Nothing else can be holding a port the kernel just
 * handed out, so an `EADDRINUSE` there can only be the wildcard socket itself.
 *
 * That is the whole point. The same question asked about the REAL port cannot tell our primary
 * from a stranger; asked here it can, and the answer transfers because it is a property of the
 * kernel rather than of the port.
 *
 * `false` on any surprise. Wrong towards "not dual-stack" costs a `localhost` origin on a kernel
 * that would have been fine; wrong the other way hands that origin to whoever holds `127.0.0.1`.
 */
/** Resolves the errno a bind failed with, or null when it succeeded. Kept separate so the probe
 *  below reads as three steps rather than as four levels of callback. */
function bindOutcome(server: Server, port: number, host: string): Promise<string | null> {
  return new Promise((resolve) => {
    server.once("error", (err: NodeJS.ErrnoException) => resolve(err.code ?? "EUNKNOWN"));
    server.once("listening", () => resolve(null));
    server.listen(port, host);
  });
}

const closeQuietly = (server: Server): Promise<void> => new Promise((resolve) => server.close(() => resolve()));

export async function kernelV6WildcardTakesV4(): Promise<boolean> {
  const wildcard = createServer();
  if ((await bindOutcome(wildcard, 0, V6_WILDCARD)) !== null) return false;
  const bound = wildcard.address();
  const port = bound !== null && typeof bound !== "string" ? bound.port : null;
  if (port === null) {
    await closeQuietly(wildcard);
    return false;
  }
  const v4 = createServer();
  const errno = await bindOutcome(v4, port, V4_LOOPBACK);
  if (errno === null) await closeQuietly(v4);
  await closeQuietly(wildcard);
  return errno === "EADDRINUSE";
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

/** Resolves true when this listener took its address, false when it could not.
 *
 *  `listen()` answers with exactly one of `listening` or `error` — there is no third outcome and
 *  so no timeout here. A cap would have to choose a duration for a local syscall that takes
 *  microseconds, and on expiry it could only guess at an answer the kernel is about to give. */
function startOne(loopback: LoopbackListener, plan: LoopbackPlan, port: string | number): Promise<LoopbackStatus> {
  return new Promise((resolve) => {
    loopback.once("error", (err: NodeJS.ErrnoException) => {
      // A clash under a dual-stack primary is not a loss — it is the primary itself holding the
      // address, which is exactly what this listener wanted done.
      const status: LoopbackStatus = plan.inUseProvesPrimary && err.code === "EADDRINUSE" ? "ours" : statusFromError(err);
      // An address this machine does not have costs nobody anything: no client can dial it, so
      // there is nothing to warn about and nothing to lose. Only a rival gets a warning.
      if (status === "taken") {
        console.warn(`\x1b[33m[bind]\x1b[0m could not also listen on ${plan.address}:${port} (${err.code ?? err.message}) — ${WARNING_TEXT[plan.reason]}`);
      }
      resolve(status);
    });
    loopback.listen(Number(port), plan.address, () => {
      console.log(`[bind] also listening on ${plan.address}:${port} ${START_TEXT[plan.reason]}`);
      resolve("ours");
    });
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
export async function startLoopbackListeners(
  primary: PrimaryListener,
  spares: readonly LoopbackListener[],
  port: string | number,
  v6WildcardTakesV4: () => Promise<boolean> = kernelV6WildcardTakesV4,
): Promise<LoopbackOutcome> {
  const bound = primary.address();
  // Only a `::` primary raises the question, and only then is the probe worth a syscall.
  const dualStack = bound !== null && typeof bound !== "string" && bound.address === V6_WILDCARD ? await v6WildcardTakesV4() : false;
  const plans = loopbackListenPlans(bound, dualStack);
  const results = await Promise.all(
    plans.map((plan, i) => {
      const spare = spares[i];
      if (spare === undefined) {
        console.warn(`\x1b[33m[bind]\x1b[0m no spare server for ${plan.address}:${port} — ${WARNING_TEXT[plan.reason]}`);
        return Promise.resolve<LoopbackStatus>("taken");
      }
      return startOne(spare, plan, port);
    }),
  );
  // No plan for an address means the PRIMARY already answers there — ours, with nothing to take.
  const statusOf = (address: string): LoopbackStatus => {
    const at = plans.findIndex((plan) => plan.address === address);
    return at === -1 ? "ours" : (results[at] ?? "taken");
  };
  return { v6: statusOf(V6_LOOPBACK), v4: statusOf(V4_LOOPBACK) };
}
