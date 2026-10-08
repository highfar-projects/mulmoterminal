import { spawn, type ChildProcess } from "node:child_process";

// SIGTERM first because git removes its lock files on SIGTERM and not on SIGKILL: a `git status`
// killed outright can leave `.git/index.lock` behind and fail every git call after it.
const KILL_ESCALATION_MS = 2_000;

/** Whether `killTree` can reach the grandchildren of a child spawned with these options. POSIX
 *  needs the child to lead its own process group; Windows walks the tree with taskkill instead,
 *  and a detached child there would open a console window of its own. */
export const spawnsOwnGroup = process.platform !== "win32";

const signalGroup = (pid: number, signal: NodeJS.Signals): void => {
  try {
    process.kill(-pid, signal);
  } catch {
    // ESRCH: every process in the group has already gone, which is the outcome this was for.
  }
};

// Ends the child AND everything it started that is still in its process group — the git-lfs
// `filter-process` a timed-out `git status` leaves holding the stdout pipe (#2935). A process
// that put itself in a new session (git's own daemons do) is out of reach by design.
export function killTree(child: ChildProcess): void {
  const { pid } = child;
  if (pid === undefined) return;
  if (!spawnsOwnGroup) {
    // eslint-disable-next-line sonarjs/no-os-command-from-path -- taskkill is a Windows system tool; the pid is a number we were given by spawn
    spawn("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true }).on("error", () => child.kill());
    return;
  }
  signalGroup(pid, "SIGTERM");
  setTimeout(() => signalGroup(pid, "SIGKILL"), KILL_ESCALATION_MS).unref();
}
