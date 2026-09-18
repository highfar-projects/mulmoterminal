// `mulmoterminal stop` — end the servers that are running, from any terminal (#1820).
//
// The route that was missing. Until now the only way a user could stop MulmoTerminal was Ctrl+C in
// the terminal that started it, and that terminal is exactly what gets lost: `npx mulmoterminal`
// opens a browser, so attention moves there, and the reported case is a user whose starting tab was
// buried among many others.
//
// It works because the answer was already being written down. Every server registers itself in
// ~/.mulmoterminal/instances/<pid>.json (#1061), which is how the launcher can already say "one is
// already running" — the pid is right there, so stopping it needs no discovery at all.
//
// This is the one route that works on EVERY platform, and Windows is the reason it is not optional:
// `process.title` renames the console there, not the process, so nothing about the naming helps a
// Windows user find or kill anything.
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { stopCommandFor } from "./cli-args.js";
import { isProcessAlive, liveInstances } from "./instances.js";
import { portOwners } from "./port-owner.js";

// How long a server is given to end itself before it is reported as stubborn. Generous on purpose:
// what happens in that window is the same shutdown Ctrl+C runs, and reporting "did not stop" about
// a server that was merely mid-shutdown would send the user hunting for a problem that isn't there.
const GRACE_MS = 5000;
const POLL_MS = 100;

// How long the HTTP attempt below gets before falling back to a bare signal. Short on purpose:
// GRACE_MS is what actually waits for the process to be gone, so this only has to distinguish
// "reachable" from "not" quickly, not itself wait out a slow shutdown.
const SHUTDOWN_REQUEST_TIMEOUT_MS = 1000;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The default `kill`: the same /api/shutdown route the browser's own Stop button hits (#1820),
 * tried first, with a bare signal as the fallback.
 *
 * `process.kill(pid, "SIGTERM")` alone — this file's ENTIRE previous implementation — never
 * reaches the server's graceful-shutdown handler on Windows: libuv has no real SIGTERM there, so
 * a signal sent at a DIFFERENT process (which is what `mulmoterminal stop` always is — a separate
 * CLI invocation, not the process that started the server) maps straight to TerminateProcess. HTTP
 * is the one channel that behaves the same on every platform, since it never asks the OS to
 * deliver anything to a specific process at all.
 *
 * Falls back to the signal when the route can't be reached — an older server without it, one
 * already mid-shutdown, or a genuinely stuck process a graceful request was never going to move —
 * so a server this cannot reach nicely is still asked the old way rather than left alone.
 */
async function defaultKill(pid, port) {
  if (port !== null && port !== undefined) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/shutdown`, { method: "POST", signal: AbortSignal.timeout(SHUTDOWN_REQUEST_TIMEOUT_MS) });
      if (res.ok) return;
    } catch {
      // unreachable — fall through to the signal below
    }
  }
  process.kill(pid, "SIGTERM");
}

/**
 * Is the process behind this entry still the server that wrote it?
 *
 * A LIVE PID IS NOT AN IDENTITY. A server that was killed outright — or that died with the machine
 * — leaves its file behind, and the OS is free to hand that pid to something else afterwards. The
 * registry has always tolerated that, because its only reader asked a harmless question ("is one
 * already running?"). Signalling raises the stakes: the same staleness would send SIGTERM to a
 * stranger's process (CodeRabbit and Codex both raised this on #1824).
 *
 * ASK THE KERNEL WHO OWNS THE PORT. The entry pairs a pid with a port, so that pairing is exactly
 * what has to be confirmed, and the OS is the only party that knows it and cannot be lied to over a
 * socket. Two weaker answers were tried first and both are recorded in bin/port-owner.js.
 *
 * FAILS CLOSED. When the kernel cannot be asked at all, this says no rather than falling back to
 * something softer: a fallback would put the weaker check back on the path the user takes by
 * default, and `--force` already exists to say "I accept the risk" out loud (Codex).
 */
export async function confirmInstance(instance, deps = {}) {
  if (instance.port === null) return false;
  const { owners = portOwners } = deps;
  const pids = await owners(instance.port);
  return pids !== null && pids.includes(instance.pid);
}

/**
 * Ask every instance to stop, and report which did.
 *
 * The graceful route by default (`defaultKill` above), not a bare signal — that is what runs the
 * same shutdown Ctrl+C runs, which is the whole promise of this command, and reaches it on every
 * platform rather than only where a cross-process signal happens to. The effects are injected so
 * the waiting and the reporting can be tested without spawning anything or making a real request.
 */
export async function stopInstances(instances, effects = {}) {
  const { kill = defaultKill, isAlive = isProcessAlive, sleep = wait, graceMs = GRACE_MS, confirm = confirmInstance, force = false } = effects;

  const stubborn = [];
  const unconfirmed = [];
  const asked = [];
  // A test double's `kill` returns synchronously (throwing IS the ESRCH/EPERM signal, caught
  // below exactly as before); the real default is async (it tries HTTP first) and its rejection
  // cannot reach a synchronous catch — collected here instead, and awaited before the poll loop
  // so a slow request settles before anything asks whether the process is still alive.
  const asyncFailures = [];
  for (const instance of instances) {
    // `--force` is the way out for a server that has stopped answering but is still there: it is
    // the one case this cannot tell apart from a reused pid, so the user decides rather than us.
    if (!force && !(await confirm(instance))) {
      unconfirmed.push(instance);
      continue;
    }
    try {
      const result = kill(instance.pid, instance.port);
      if (result && typeof result.then === "function") {
        asyncFailures.push(
          result.catch((err) => {
            if (err?.code !== "ESRCH") stubborn.push({ ...instance, reason: err?.code ?? "failed" });
          }),
        );
      }
      asked.push(instance);
    } catch (err) {
      // ESRCH means it ended between the registry being read and now — which is success, just not
      // ours. Anything else (EPERM: another user's process) is a refusal the user has to see.
      if (err?.code !== "ESRCH") stubborn.push({ ...instance, reason: err?.code ?? "failed" });
    }
  }
  await Promise.all(asyncFailures);

  for (let waited = 0; waited < graceMs && asked.some((i) => isAlive(i.pid)); waited += POLL_MS) {
    await sleep(POLL_MS);
  }

  const stopped = asked.filter((i) => !isAlive(i.pid));
  const slow = asked.filter((i) => isAlive(i.pid)).map((i) => ({ ...i, reason: "still running" }));
  return { stopped, stubborn: [...stubborn, ...slow], unconfirmed };
}

/** How an instance is named to the user. The port is what they recognise it by — it is the URL
 *  they have open — and the pid is what they need if they end up killing it by hand. */
export const describeInstance = (instance) => (instance.port === null ? `pid ${instance.pid}` : `http://localhost:${instance.port} (pid ${instance.pid})`);

/** The command that ends a process by hand, for the platform the user is actually on. `kill -9` is
 *  not a thing in a standard Windows shell, and this whole feature exists BECAUSE of a Windows
 *  report — printing an unusable command there would be the same failure again. */
export const manualStopCommand = (pids, platform = process.platform) =>
  platform === "win32" ? pids.map((pid) => `taskkill /PID ${pid} /F`).join(" && ") : `kill -9 ${pids.join(" ")}`;

/** How the user would run this command again — `mulmoterminal stop` for a global install, the npx
 *  form for an npx one. From this file's OWN location, which is inside the package either way, so
 *  the recovery hint below cannot name a binary the reader does not have (Codex). */
const selfStopCommand = () => stopCommandFor(dirname(fileURLToPath(import.meta.url)));

/** Everything the command prints, as lines, so the wording is testable without running it. */
export function stopReport({ stopped, stubborn, unconfirmed }, platform = process.platform, stopCommand = selfStopCommand()) {
  if (!stopped.length && !stubborn.length && !unconfirmed.length) return ["MulmoTerminal is not running."];
  const lines = stopped.map((i) => `Stopped ${describeInstance(i)}`);
  stubborn.forEach((i) => lines.push(`Could NOT stop ${describeInstance(i)} — ${i.reason}`));
  // "not answering" would be wrong for the case that motivated the check: the port can answer
  // perfectly well and simply be a DIFFERENT server. What is unconfirmed is the pid, so say that.
  unconfirmed.forEach((i) => lines.push(`Left alone: ${describeInstance(i)} — could not confirm that pid is the server there.`));
  if (unconfirmed.length) {
    lines.push("  It probably crashed, in which case that pid can since have been given to an unrelated program.");
    lines.push(`  Stop it anyway with:  ${stopCommand} --force`);
  }
  // Only when something is left behind: the pid is the one thing a user cannot look up once the
  // registry has been read for them.
  const byHand = [...stubborn, ...unconfirmed].map((i) => i.pid);
  if (byHand.length) lines.push(`Or end it by hand with: ${manualStopCommand(byHand, platform)}`);
  return lines;
}

/** Exit non-zero only when asked to stop something and it is still there — "nothing was running" is
 *  the state the user asked for, so a script that runs this before starting a new server should not
 *  see it as a failure. */
export const stopExitCode = ({ stubborn, unconfirmed }) => (stubborn.length + unconfirmed.length ? 1 : 0);

export const STOP_USAGE = [
  "Usage: mulmoterminal stop [--force]",
  "",
  "Stops every running MulmoTerminal server on this machine, from any terminal.",
  "",
  "  --force   Also stop a registered server that is no longer answering. Off by default:",
  "            a server that crashed leaves its entry behind, and that pid may since have",
  "            been given to an unrelated program.",
].join("\n");

/** What `stop` was asked to do, decided before anything is signalled. Its own function so the
 *  argument handling is testable — and so `stop --help` can never be read as "stop everything". */
export function parseStopArgs(args) {
  if (args.includes("--help") || args.includes("-h")) return { help: true };
  const unknown = args.filter((a) => a !== "--force");
  if (unknown.length) return { error: `Unknown argument for stop: ${unknown.join(" ")}` };
  return { force: args.includes("--force") };
}

export async function runStop(args = []) {
  const parsed = parseStopArgs(args);
  if (parsed.help) {
    console.log(STOP_USAGE);
    return;
  }
  if (parsed.error) {
    console.error(parsed.error);
    console.error(STOP_USAGE);
    process.exit(2);
  }
  const result = await stopInstances(liveInstances(), { force: parsed.force });
  stopReport(result).forEach((line) => console.log(line));
  process.exit(stopExitCode(result));
}
