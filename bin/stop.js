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
import { isProcessAlive, liveInstances } from "./instances.js";

// How long a server is given to end itself before it is reported as stubborn. Generous on purpose:
// what happens in that window is the same shutdown Ctrl+C runs, and reporting "did not stop" about
// a server that was merely mid-shutdown would send the user hunting for a problem that isn't there.
const GRACE_MS = 5000;
const POLL_MS = 100;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
  const { kill = (pid) => process.kill(pid, "SIGTERM"), isAlive = isProcessAlive, sleep = wait, graceMs = GRACE_MS } = effects;

  const stubborn = [];
  const asked = [];
  for (const instance of instances) {
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
  return { stopped, stubborn: [...stubborn, ...slow] };
}

/** How an instance is named to the user. The port is what they recognise it by — it is the URL
 *  they have open — and the pid is what they need if they end up killing it by hand. */
export const describeInstance = (instance) => (instance.port === null ? `pid ${instance.pid}` : `http://localhost:${instance.port} (pid ${instance.pid})`);

/** Everything the command prints, as lines, so the wording is testable without running it. */
export function stopReport({ stopped, stubborn }) {
  if (!stopped.length && !stubborn.length) return ["MulmoTerminal is not running."];
  const lines = stopped.map((i) => `Stopped ${describeInstance(i)}`);
  stubborn.forEach((i) => lines.push(`Could NOT stop ${describeInstance(i)} — ${i.reason}`));
  // Only when something is left behind: the pid is the one thing a user cannot look up once the
  // registry has been read for them.
  if (stubborn.length) lines.push(`Kill it by hand with: kill -9 ${stubborn.map((i) => i.pid).join(" ")}`);
  return lines;
}

/** Exit non-zero only when asked to stop something and failed — "nothing was running" is the state
 *  the user asked for, so a script that runs this before starting a new server should not see it
 *  as a failure. */
export const stopExitCode = ({ stubborn }) => (stubborn.length ? 1 : 0);

export async function runStop() {
  const result = await stopInstances(liveInstances());
  stopReport(result).forEach((line) => console.log(line));
  process.exit(stopExitCode(result));
}
