// Which process holds a TCP port, according to the OPERATING SYSTEM (#1820).
//
// `mulmoterminal stop` needs to prove that the pid in ~/.mulmoterminal/instances/<pid>.json is the
// process actually serving that port before it signals it, and every answer short of this one is
// weaker than it looks:
//
//   the pid is alive          — says nothing; a crashed server leaves its file and pids get reused
//   the port answers HTTP     — says a server is up, not that it is THAT pid (crash, restart on the
//                               same port, old pid reused) — and says nothing at all when the
//                               server is hung, which is when stopping it matters most
//   the server reports its pid — an unauthenticated self-report, which anything on loopback can
//                               forge (Codex on #1824)
//
// The kernel is the authority and cannot be lied to over a socket. It also keeps answering for a
// process that has stopped responding, because holding the socket and servicing it are different
// things — measured: a SIGSTOPped server answers nothing over HTTP while this still names it.
//
// The route here came from the bug report itself: the Windows user who could not find their
// terminal stopped the server with `Get-NetTCPConnection -LocalPort … | Stop-Process -Id
// $_.OwningProcess`, i.e. by asking the OS who owned the port (#1820 comment).
import { execFile } from "node:child_process";

const LOOKUP_TIMEOUT_MS = 3000;

/**
 * The per-platform command, and how to read pids out of what it prints.
 *
 * macOS/Linux: `-t` is terse (pids only), `-n -P` skip reverse-DNS and service-name lookups, which
 * is the difference between 115ms and 850ms. `-sTCP:LISTEN` excludes clients connected TO the port
 * — without it, an open browser tab's own socket is reported as an owner.
 *
 * Windows: PowerShell, because `Get-NetTCPConnection` is the documented way to reach OwningProcess
 * and it is what the report used. `-State Listen` is the same narrowing as `-sTCP:LISTEN`.
 */
export function portOwnerCommand(port, platform) {
  if (platform === "win32") {
    return {
      file: "powershell.exe",
      args: [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        `Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess`,
      ],
    };
  }
  return { file: "lsof", args: ["-nP", "-ti", `tcp:${port}`, "-sTCP:LISTEN"] };
}

/** Every pid the output names. Lines rather than a split on whitespace, because PowerShell pads. */
export const parsePortOwners = (stdout) =>
  String(stdout)
    .split(/\r?\n/)
    .map((line) => Number.parseInt(line.trim(), 10))
    .filter((pid) => Number.isInteger(pid) && pid > 0);

/**
 * The pids listening on `port`, or NULL when the question could not be asked — a missing `lsof`, a
 * platform we have no command for, a timeout.
 *
 * Null and [] are different answers and the caller must treat them so: [] means the OS says nobody
 * is listening, null means we do not know. Collapsing them would turn "cannot check" into "not
 * ours", or worse the other way round.
 */
export function portOwners(port, deps = {}) {
  const { platform = process.platform, run = execFile, timeoutMs = LOOKUP_TIMEOUT_MS } = deps;
  const command = portOwnerCommand(port, platform);
  return new Promise((resolve) => {
    try {
      run(command.file, command.args, { timeout: timeoutMs, windowsHide: true }, (err, stdout) => {
        // lsof exits 1 when nothing matches, which is an ANSWER ("nobody"), not a failure — told
        // apart from a missing binary by there being no spawn error code.
        if (err && (err.code === "ENOENT" || err.killed || err.signal)) return resolve(null);
        resolve(parsePortOwners(stdout ?? ""));
      });
    } catch {
      resolve(null);
    }
  });
}
