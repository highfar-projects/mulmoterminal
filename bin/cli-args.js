// What the launcher decides before it starts anything, kept out of the executable so each
// decision can be checked without a process to exit or a terminal to type into.
//
// `--cwd` picks the workspace claude runs in and whose sessions the sidebar lists, so it is
// a data-scope boundary: getting it wrong points the whole app at someone else's project.
// `--port` decides whether a clash is a hard error or a silent retry. Both used to be
// decided inside the executable, where they exit the process on a bad value and so could not
// be checked at all (#611 A3).
//
// These return a decision; the caller prints and exits. Nothing here reads argv, the
// environment or the filesystem.
import { isIP } from "node:net";

// The v4 loopback every local client of this server dials by literal — `guiMcpUrlTemplate` in
// server/infra/gui-mcp-registration.ts builds `http://127.0.0.1:<port>/api/mcp/...`. Duplicated
// here because bin/ is plain JS and cannot import the server's TypeScript, and pinned by a spec
// the same way PORT_IN_USE_EXIT_CODE is.
const V4_LOOPBACK_CLIENTS_DIAL = "127.0.0.1";

// The two addresses a kernel reports for a wildcard bind. Exact, not a list of spellings: these
// are what `server.address()` RETURNS, and it returns nothing else for an unspecified bind.
const V4_UNSPECIFIED = "0.0.0.0";
const V6_UNSPECIFIED = "::";

// Whether a bind address serves only this machine. Mirrors isLoopbackAddress in
// server/infra/loopback.ts — the whole 127.0.0.0/8 block, `::1` in both spellings, and the
// `::ffff:` mapped form — because bin/ is plain JS and cannot import it. A spec pins the two
// together. Written as a property so a spelling nobody listed (`127.0.0.2`, `::ffff:127.0.0.1`)
// is covered rather than becoming another review round.
const LOOPBACK_V4_OCTET = "(25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)";
const LOOPBACK_V4 = new RegExp(`^127\\.${LOOPBACK_V4_OCTET}\\.${LOOPBACK_V4_OCTET}\\.${LOOPBACK_V4_OCTET}$`);

function isLoopbackBindHost(address) {
  if (!address) return false;
  const bare = address.startsWith("::ffff:") ? address.slice("::ffff:".length) : address;
  if (bare === "::1" || bare === "0:0:0:0:0:0:0:1") return true;
  return LOOPBACK_V4.test(bare);
}
import { join } from "node:path";

/** A port a user typed, in either of the two places they can type one. `parseInt` stops at the
 *  first non-digit, so a typo would otherwise launch on a port nobody named — "80x" silently
 *  becoming 80 is worse than being told. `source` names the place, so the message points at
 *  what to correct. */
function readPort(raw, source) {
  const parsed = Number.parseInt(raw ?? "", 10);
  if (!Number.isInteger(parsed) || String(parsed) !== raw || parsed < 1 || parsed > 65535) {
    return { error: `Invalid ${source} value: "${raw ?? ""}" (expected integer 1..65535)` };
  }
  return { port: parsed, explicit: true };
}

/**
 * Which port the launcher should ask for: `--port` > `PORT` > the default — the order
 * `bin/room.js` already uses, so the two entry points of this package agree.
 *
 * `PORT` was ignored entirely until #1861, while the busy-port message told people to set it.
 * An invalid one is refused rather than dropped for the same reason a bad `--port` is: falling
 * back to the default silently IS the bug being fixed. An empty or unset `PORT` is not a value
 * and falls through.
 *
 * A `PORT` from the environment counts as `explicit`, which is what decides whether a busy port
 * stops the launch or offers a second instance on another one. The user named a port either
 * way, and offering a different one answers a question nobody asked.
 */
export function parsePortArg(args, env, defaultPort) {
  const at = args.indexOf("--port");
  if (at !== -1) return readPort(args[at + 1], "--port");
  if (env.PORT === undefined || env.PORT === "") return { port: defaultPort, explicit: false };
  return readPort(env.PORT, "PORT");
}

/**
 * The address the server will bind, and therefore the ONE address a port probe has to try.
 *
 * `isPortFree` used to probe with no host — the `::` dual-stack wildcard — and its comment
 * justified that by saying the server did the same. It did, until the server moved to loopback
 * by default (b696a967, 2026-07-26) and never touched this file. From then on the probe asked
 * about an address nothing was listening on, so it answered "free" for a port a running
 * MulmoTerminal was holding, and the second-instance guard (#611, #653) stopped firing (#1876).
 *
 * Measured on macOS: a bind only collides with the SAME address. With 34567 held on
 * `127.0.0.1`, `listen(34567)`, `listen(34567,'::')` and `listen(34567,'0.0.0.0')` all
 * succeed; only `listen(34567,'127.0.0.1')` reports EADDRINUSE.
 *
 * So this is deliberately NOT a fixed host. Pinning `127.0.0.1` would re-break what #31 fixed —
 * an operator who widens the bind would go back to missing a peer on the wildcard. The probe
 * follows whatever the server will do, by reading the same variable the server reads
 * (`BIND_HOST` in server/config/env.ts). Keep the default in step with that file; a spec
 * asserts the two agree, the same way PORT_IN_USE_EXIT_CODE is pinned.
 *
 * And note what the probe is FOR: not "is anyone using this port", but "will the child's
 * listen(port, BIND_HOST) succeed". Probing the same address answers exactly that.
 */
export function bindHostFor(env) {
  return env.MULMOTERMINAL_HOST || "127.0.0.1";
}

/**
 * A port probe failed. Does that mean the PORT IS TAKEN, or only that the probe could not ask?
 *
 * Only `EADDRINUSE` answers the question. Naming a host on the probe (see bindHostFor) made the
 * other errors reachable for the first time: a `MULMOTERMINAL_HOST` that is not an address on
 * this machine fails `EADDRNOTAVAIL`, a name that does not resolve fails `ENOTFOUND`, and a
 * privileged port fails `EACCES`. Folding any of those into "in use" tells the operator to stop
 * a process that does not exist and to pick a port that was never the problem.
 *
 * The honest answer for those is "I could not tell", and the useful behaviour is to let the
 * launch proceed: the server binds for real and reports the actual errno, which is exactly what
 * happened before the probe named a host.
 */
export function probeFailureIsPortInUse(err) {
  return Boolean(err) && err.code === "EADDRINUSE";
}

/**
 * Given the address the OS says a bind actually LANDED ON, which other addresses must also be
 * free before this launch is worth starting.
 *
 * It takes the bound address and not the requested string, and that is the whole point. Eight
 * review rounds were spent on spellings — `::` vs `0:0:0:0:0:0:0:0`, `::1` vs its long form,
 * `localhost`, `127.1` — and a host string has no last case. The kernel has none of that
 * problem, because it has already resolved whatever was typed. Measured: `listen(0,
 * "0:0:0:0:0:0:0:0")` reports `::`, `listen(0,"localhost")` reports `::1`, `listen(0,"127.1")`
 * reports `127.0.0.1`. So the comparisons below are exact rather than a list, because the
 * kernel's OUTPUT vocabulary is finite and fixed even though its input vocabulary is not.
 *
 * server/infra/loopback.ts made the same argument for its own question: "Classifying the
 * requested string cannot be made right … Asking after the fact answers all of them."
 *
 * WHICH BINDS GET A COMPANION, by the bind's PURPOSE rather than by the server's volume:
 *
 *   - a wildcard, or any loopback address, serves ONLY this machine (or this machine among
 *     others), so misrouting this machine's own clients leaves the launch with no purpose. Every
 *     GUI MCP client dials `http://127.0.0.1:<port>` by literal (guiMcpUrlTemplate), and for a
 *     `::` primary the server's own loopback listener treats EADDRINUSE as fine and says nothing
 *     — so nobody else will report it.
 *   - a specific NON-loopback bind was chosen to serve other machines, and that purpose survives
 *     a degraded local listener, which the server does warn about. Not the launcher's to veto
 *     (the call declined in round 2, and it still stands).
 *
 * The probe/bind race the launcher already lives with is unchanged: this narrows the window, it
 * does not close it.
 */
export function companionHostsFor(boundAddress) {
  if (!servesOnlyThisMachine(boundAddress)) return [];
  if (!willServeV4Loopback(boundAddress)) return [];
  const companions = boundAddress === V6_UNSPECIFIED ? ["::1", V4_LOOPBACK_CLIENTS_DIAL] : [V4_LOOPBACK_CLIENTS_DIAL];
  return companions.filter((host) => host !== boundAddress);
}

/** Does this bind serve only this machine? A wildcard serves it among others; a loopback address
 *  serves nothing else. Either way, misrouting this machine's own clients leaves the launch with
 *  no purpose. A specific non-loopback address was chosen to serve OTHERS, and that purpose
 *  survives — round 2's call, still standing. */
function servesOnlyThisMachine(boundAddress) {
  return boundAddress === V4_UNSPECIFIED || boundAddress === V6_UNSPECIFIED || isLoopbackBindHost(boundAddress);
}

/** Will the server end up answering on `127.0.0.1` at all? Mirrors loopbackListenPlan: the v4
 *  wildcard covers it directly (falling through below, since it is not loopback), and otherwise
 *  the secondary listener supplies it — EXCEPT when
 *  the server thinks the primary already serves v4 loopback, which it decides with
 *  `isLoopbackAddress(a) && !a.includes(":")`.
 *
 *  That exception is why `127.0.0.2` gets no companion. The server plans no secondary listener
 *  for it and does not answer on `127.0.0.1` either, so reserving that port would be a promise
 *  this launch cannot keep — and could refuse a launch for no benefit. Found by the CI reviewer,
 *  which spotted the guard over-promising.
 *
 *  NOTE, and deliberately not fixed here: a `127.0.0.2` bind therefore leaves GUI MCP and hooks
 *  unable to reach the server AT ALL, free port or not, because they dial `127.0.0.1` by literal.
 *  That is a pre-existing gap in the server's own assumption (any 127/8 "serves v4 loopback"),
 *  not something this launcher can paper over, and it is reported rather than patched from here. */
function willServeV4Loopback(boundAddress) {
  // No special case for the v4 wildcard, and that is not an oversight: `0.0.0.0` is not a
  // loopback address, so it falls through to `true` on its own. An explicit early return for it
  // was here and a mutation proved it changed nothing — dead weight that also reads as though
  // the two cases differ.
  const serverThinksPrimaryCoversIt = isLoopbackBindHost(boundAddress) && !boundAddress.includes(":");
  return !serverThinksPrimaryCoversIt;
}

/**
 * The concrete address the LAUNCHER should connect to, or **null when it cannot know**.
 *
 * This is the PERMITTED set, not a list of bad cases, and it got there the hard way: four review
 * rounds each found a different spelling of `BIND_HOST` that a guess got wrong — the poll
 * ignoring it, the URL turning `::1` back into `localhost`, `localhost` passing through
 * unresolved, and then the fallback re-opening that same hole. A host string has no last case
 * (`127.1`, `127.000.000.001`, a hosts file pointing `localhost` somewhere else), so the rule
 * is inverted: an address the platform itself calls an IP is usable, the two wildcards map to
 * the loopback of their own family, and **everything else is null** — reported rather than
 * guessed at.
 *
 * `::` maps to `::1` and not to `127.0.0.1` on purpose: a v4 socket on 127.0.0.1 is MORE
 * SPECIFIC than a dual-stack bind and wins the connection, so polling v4 could be answered by
 * the very stranger this exists to avoid.
 *
 * The authority for a name is the kernel, not this function, and the launcher asks it the only
 * way that is exact — the child reports what `server.address()` says it bound. See
 * server/infra/loopback.ts, which had already written the argument down for its own question.
 */
export function launcherReachHost(bindHost) {
  if (bindHost === "0.0.0.0") return "127.0.0.1";
  if (bindHost === "::") return "::1";
  return isIP(bindHost) ? bindHost : null;
}

/** What to PRINT for a concrete address — never `localhost`.
 *
 *  It did say `localhost` for the loopback cases, because that is friendlier. CodeRabbit caught
 *  what that throws away: `launcherReachHost` picks `::1` precisely so an IPv4 listener cannot
 *  answer for us, and printing `localhost` hands the choice straight back — measured, `localhost`
 *  resolves to BOTH `::1` and `127.0.0.1`, so the browser may open the very process the poll was
 *  written to avoid. A URL the user clicks has to name the address that was checked.
 *
 *  Built through `URL` so the platform does the escaping: an IPv6 literal has to be bracketed or
 *  `http://::1:34567` is not a URL at all. The brackets go on BEFORE the assignment because the
 *  `hostname` setter silently REJECTS an unbracketed v6 literal — measured: it leaves the
 *  previous host in place, so the launcher would have printed the base host instead. */
export function launcherUrl(reachHost, port) {
  const url = new URL(`http://localhost:${port}`);
  url.hostname = reachHost.includes(":") ? `[${reachHost}]` : reachHost;
  return url.origin;
}

/**
 * Which directory to run in, before it is made absolute.
 * Precedence: `--cwd` (relative allowed) > CLAUDE_CWD > the directory the launcher was run
 * from. `mustExist` is set only for `--cwd`: a typo there should stop the launch, while a
 * CLAUDE_CWD naming a directory that isn't there yet is the managed-workspace case the
 * server creates on boot.
 */
export function chooseCwd(args, env) {
  const at = args.indexOf("--cwd");
  if (at === -1) return { path: env.CLAUDE_CWD ?? ".", mustExist: false };
  const value = args[at + 1];
  // A missing value swallows the next flag ("--cwd --port 3000" would run in a directory
  // called "--port"), so anything flag-shaped is treated as absent.
  if (value === undefined || value.startsWith("-")) return { error: "--cwd requires a directory path" };
  return { path: value, mustExist: true };
}

/**
 * What to say when the port is taken.
 *
 * Running a second server is not a supported setup: both share ~/.mulmoterminal and the
 * workspace, but each keeps its own PTYs, pub/sub and in-memory caches, so the two disagree
 * about state neither can see the other change. Starting one silently on another port —
 * which is what a plain second `npx mulmoterminal` used to do — is how someone ends up in
 * that setup without knowing (#611).
 *
 * So the message has to answer the two things the user actually wants: where the running one
 * is, and how to insist if a second is really wanted.
 */
export function portInUseMessage(port, explicit) {
  const lines = [`Port ${port} is already in use.`];
  lines.push(`  If that is MulmoTerminal, it is already running at http://localhost:${port}`);
  lines.push(explicit ? "  Pick a different --port, or stop the other process." : "  To start a second one anyway: --port <number>");
  return lines.join("\n");
}

/**
 * What to do when the wanted port is taken: "ask" whether to start a second instance,
 * or "stop".
 *
 * Two conditions rule the question out. A port the user NAMED — `--port`, or `PORT` in the
 * environment (#1861) — already says which one was wanted, so offering a different one answers
 * a question nobody asked; and with no terminal to type into (a script, a service, CI) a prompt
 * has nobody to answer it and would hang the start instead of failing it.
 */
export function portInUseAction(explicit, isTTY) {
  return explicit || !isTTY ? "stop" : "ask";
}

/**
 * The question asked when the default port is taken and there is somebody to answer.
 *
 * Two servers is not a supported setup (#611), but it is a legitimate thing to want on
 * purpose — so the answer is a question rather than a refusal, and the default is no.
 */
export function secondInstancePrompt(port) {
  return [`Port ${port} is already in use — MulmoTerminal may already be running at http://localhost:${port}`, "Start a second instance anyway? [y/N] "].join(
    "\n",
  );
}

/**
 * Whether an answer to that question is a yes.
 *
 * Only an explicit yes counts. The prompt says [y/N], so Enter — and anything unrecognised —
 * means no: starting a second server by misreading a stray keystroke is the outcome worth
 * avoiding, and saying no costs one retyped command.
 */
export function saysYes(answer) {
  return /^y(es)?$/i.test(String(answer ?? "").trim());
}

/**
 * What someone who said yes should know before the second one comes up.
 *
 * One line, and only the part that is still true: config and the hidden-session list are
 * safe across instances, but a session's tool history is cached per process and its live
 * updates never cross — so the instance that did not start a session shows a frozen history
 * for it (#611).
 */
/**
 * The question asked when another server is ALREADY RUNNING, whatever port this one was told to
 * use (#1061).
 *
 * `secondInstancePrompt` below only fires when the wanted port is taken, so `--port <free>`
 * started a second instance in silence — which is how eight live sessions had their settings
 * deleted by a peer's boot. The clash is a symptom; the shared `~/.mulmoterminal` is the thing
 * that is not supported, and that is true at any port.
 */
// npx leaves no `mulmoterminal` on the PATH, so telling an npx user to run `mulmoterminal stop` in
// another terminal names a command they do not have (CodeRabbit). The package directory says which
// they are: npx unpacks into `<cache>/_npx/<hash>/node_modules/mulmoterminal`.
const NPX_INSTALL = /[/\\]_npx[/\\]/;

export const stopCommandFor = (pkgDir) => (NPX_INSTALL.test(String(pkgDir)) ? "npx mulmoterminal@latest stop" : "mulmoterminal stop");

export function runningInstancesPrompt(instances, stopCommand = "mulmoterminal stop") {
  const where = instances.map((i) => (i.port === null ? `pid ${i.pid}` : `http://localhost:${i.port}`)).join(", ");
  const subject = instances.length === 1 ? "MulmoTerminal is already running" : `${instances.length} MulmoTerminal servers are already running`;
  return [
    `${subject} (${where}).`,
    "  Running more than one is NOT a supported setup: they share ~/.mulmoterminal,",
    "  so they can overwrite each other's session state.",
    // This is the moment the user asks how to stop the old one — most often because they are here
    // to run a NEWER version (#1820). Answering it anywhere else means answering it too late.
    `  To stop the running one instead:  ${stopCommand}`,
    "Start another one anyway? [y/N] ",
  ].join("\n");
}

export const SECOND_INSTANCE_NOTE = [
  "  Note: both share ~/.mulmoterminal. A session's tool history does not live-update",
  "  in the instance that did not start it.",
].join("\n");

const MIN_NODE_MAJOR = 22;
const MIN_NODE_MINOR = 9;

/**
 * The lowest Node the `init` check reports as good, for the "needs ≥ x.y" line.
 */
export const MIN_NODE_LABEL = `${MIN_NODE_MAJOR}.${MIN_NODE_MINOR}`;

/**
 * Whether the running Node is new enough for the `init` pre-flight tick.
 *
 * `process.versions.node` is "major.minor.patch", with a "-prerelease" tag on the patch for
 * nightlies ("22.9.0-nightly…"). Only major.minor gate, and Number.parseInt stops at the
 * first non-digit, so that tag never reaches the comparison. A string that is not a version
 * parses to NaN, and every comparison against NaN is false, so an unreadable version reads as
 * "below minimum" — the safe direction for a display-only check.
 */
export function nodeMeetsMinimum(version) {
  const [major, minor] = version.split(".").map((part) => Number.parseInt(part, 10));
  return major > MIN_NODE_MAJOR || (major === MIN_NODE_MAJOR && minor >= MIN_NODE_MINOR);
}

/**
 * The node arguments the launcher spawns the server with.
 *
 * `--env-file-if-exists` is what makes a `.env` in the LAUNCH directory reach the server
 * (#795): the dev scripts have always passed it, the launcher never did, so a key written
 * there was silently absent and the provider stayed unusable. The path is absolute because
 * the spawn runs with `cwd` set to the package directory — a relative `.env` would be looked
 * for inside node_modules and quietly not found.
 *
 * Node options must precede the script path; anything after it is an argument to the script.
 * The launch directory is passed rather than read here so the choice stays checkable.
 *
 * The port goes here rather than in the environment because ARGV IS NOT INHERITED. The server
 * hands its own environment to every PTY it spawns, so a port set there reaches every terminal
 * in every cell — which is how a raw `PORT` made a dev server started in a cell try to take
 * MulmoTerminal's own port (#1857). Renaming it would only move that: `MULMOTERMINAL_PORT` is
 * deliberately given to PTYs (server/session/mcp-config.ts) for the MCP URLs, so a server
 * reading it as its bind port would clash with itself the moment `yarn dev` ran inside a cell.
 */
export function serverNodeArgs(serverEntry, launchDir, port) {
  return ["--import", "tsx", `--env-file-if-exists=${join(launchDir, ".env")}`, serverEntry, "--port", String(port)];
}

/**
 * The environment the launcher spawns the server with.
 *
 * Only the ONE value the server cannot work out for itself. In particular NOT `NODE_ENV`:
 * the server hands its own environment to every PTY it spawns, so a `NODE_ENV=production`
 * set here reaches every terminal in every cell — where yarn v1 reads it and installs
 * WITHOUT devDependencies while still reporting success (#955). Express is pinned to
 * production separately, in the server, so nothing here needs to say it.
 *
 * `PORT` was the same bug with a different name (#1857) and left by the same route; it is now
 * an argument instead (see serverNodeArgs). A `PORT` or `NODE_ENV` the user exported themselves
 * passes through untouched: this decides what the launcher adds, not what it removes.
 */
export function serverSpawnEnv(env, cwd) {
  return { ...env, CLAUDE_CWD: cwd };
}
