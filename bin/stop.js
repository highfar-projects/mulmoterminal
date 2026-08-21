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
import { get as httpGet } from "node:http";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { stopCommandFor } from "./cli-args.js";
import { isProcessAlive, liveInstances } from "./instances.js";

// How long a server is given to end itself before it is reported as stubborn. Generous on purpose:
// what happens in that window is the same shutdown Ctrl+C runs, and reporting "did not stop" about
// a server that was merely mid-shutdown would send the user hunting for a problem that isn't there.
const GRACE_MS = 5000;
const POLL_MS = 100;
const CONFIRM_TIMEOUT_MS = 1000;
const MAX_IDENTITY_BYTES = 1024;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Is the process behind this entry still the server that wrote it?
 *
 * A LIVE PID IS NOT AN IDENTITY. A server that was killed outright — or that died with the machine
 * — leaves its file behind, and the OS is free to hand that pid to something else afterwards. The
 * registry has always tolerated that, because its only reader asked a harmless question ("is one
 * already running?"). Signalling raises the stakes: the same staleness would send SIGTERM to a
 * stranger's process (CodeRabbit and Codex both raised this).
 *
 * Something merely ANSWERING on the recorded port does not settle it, which was this function's
 * first attempt: a server that crashed and was restarted on the SAME port answers happily while
 * the recorded pid has since been given to something unrelated (Codex, second pass). Only the
 * process itself can say who it is, so it is asked — GET /api/instance reports the serving pid,
 * and the entry is trusted exactly when that matches the pid the file names.
 */
export function confirmInstance(instance, get = httpGet, timeoutMs = CONFIRM_TIMEOUT_MS) {
  if (instance.port === null) return Promise.resolve(false);
  return new Promise((resolve) => {
    let settled = false;
    // Exactly one outcome per call: destroying a timed-out request itself emits 'error', so
    // without the latch a timeout would resolve twice (the same trap wait-ready.js documents).
    const done = (ok) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };
    const req = get({ host: "127.0.0.1", port: instance.port, path: "/api/instance", timeout: timeoutMs }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        return done(false);
      }
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        body += chunk;
        // A server would answer in a few dozen bytes. Anything longer is not one, and reading it
        // all first would let whatever IS on that port decide how much memory this spends.
        if (body.length > MAX_IDENTITY_BYTES) {
          req.destroy();
          done(false);
        }
      });
      res.on("end", () => done(parseIdentity(body) === instance.pid));
      res.on("error", () => done(false));
    });
    req.on("error", () => done(false));
    req.on("timeout", () => {
      req.destroy();
      done(false);
    });
  });
}

/** The pid a server claims, or null for anything that is not one of our answers. */
function parseIdentity(body) {
  try {
    const parsed = JSON.parse(body);
    return parsed && Number.isInteger(parsed.pid) ? parsed.pid : null;
  } catch {
    return null;
  }
}

/**
 * Ask every instance to stop, and report which did.
 *
 * SIGTERM, not SIGKILL: it lands on the server's own handler and runs the same shutdown Ctrl+C
 * runs, which is the whole promise of this command. The effects are injected so the waiting and
 * the reporting can be tested without spawning anything.
 *
 * Note for Windows: Node has no real signals there, so this terminates the process outright rather
 * than running its handler. Nothing is lost by it — the only thing that shutdown path cleans up is
 * the whisper sidecar, which exists on macOS alone.
 */
export async function stopInstances(instances, effects = {}) {
  const {
    kill = (pid) => process.kill(pid, "SIGTERM"),
    isAlive = isProcessAlive,
    sleep = wait,
    graceMs = GRACE_MS,
    confirm = confirmInstance,
    force = false,
  } = effects;

  const stubborn = [];
  const unconfirmed = [];
  const asked = [];
  for (const instance of instances) {
    // `--force` is the way out for a server that has stopped answering but is still there: it is
    // the one case this cannot tell apart from a reused pid, so the user decides rather than us.
    if (!force && !(await confirm(instance))) {
      unconfirmed.push(instance);
      continue;
    }
    try {
      kill(instance.pid);
      asked.push(instance);
    } catch (err) {
      // ESRCH means it ended between the registry being read and now — which is success, just not
      // ours. Anything else (EPERM: another user's process) is a refusal the user has to see.
      if (err?.code !== "ESRCH") stubborn.push({ ...instance, reason: err?.code ?? "failed" });
    }
  }

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
