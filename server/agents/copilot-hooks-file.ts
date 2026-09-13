// The hook file every copilot session on this machine reads, and the one place this agent departs
// from how claude is wired.
//
// CLAUDE GETS A FILE PER SPAWN (`--settings`, hook-settings.ts). COPILOT HAS NO SUCH FLAG, and its
// per-directory options do not work: measured against copilot 1.0.83, hooks in the working
// directory's `.github/hooks/*.json` and in a `.github/copilot/settings.json` `hooks` block never
// fired, and with `--log-level all` the hooks subsystem logged nothing about either, though both
// are documented. `$COPILOT_HOME/hooks/*.json` fired every time. So the file is MACHINE-GLOBAL.
//
// That is workable only because copilot hands every payload a `sessionId` and copilot-args.ts makes
// that id ours (`--session-id`). One file therefore identifies every session, and nothing has to be
// generated per spawn.
//
// Two consequences, both accepted rather than overlooked:
//
//   - Copilot sessions this server never started — the user's own, in a plain terminal — also post
//     here. They carry a session id we do not know, and copilotHookBody's caller drops them. The
//     cost is one silent curl per hook in someone else's terminal, which is why the command is
//     quiet and short-lived (see COMMAND below).
// WHAT IS PERMITTED HERE, rather than which interleavings are forbidden. Four rounds of review
// found four different races on this file (peer deletes a live file, reaper deletes a fresh one,
// crash between two writes, a forged marker), and enumerating interleavings is how that list stays
// infinite. The invariant instead:
//
//     At any moment this file is either ABSENT, or it names a port some MulmoTerminal is serving,
//     or it is a file we never wrote and never touch. A file we wrote is repaired by the next
//     spawn of any instance, because every spawn syncs it.
//
// ONE RESIDUAL, stated rather than argued away: a delete is check-then-unlink, and no filesystem
// here offers compare-and-delete. A user who replaced this file in the microseconds between the
// check and the unlink would lose it. Both checks are re-read immediately before the call to make
// that window as small as a syscall pair allows, and every WRITE goes through a rename so the file
// at this path is never a partial one. Named because Codex raised it on #2063 and it is real, not
// because it is reachable in practice.
//
// Every concurrent interleaving lands in ONE of those, and the cost of the bad ones is bounded to
// the accepted limitation below — one instance's copilot cells run without status until its next
// spawn. None of them can destroy a user's own file (the marker gates that), and none can leave a
// hook file posting to a dead port for longer than one spawn (marker-first writes, plus the exit
// handler and the startup reaper). That is why there is no lock here: a lock would buy strictly
// less than the invariant already gives, at the cost of a new failure mode of its own.
//
//   - Two MulmoTerminal instances on different ports share this file, and the last writer wins;
//     the other instance's copilot cells then run without status until their next spawn rewrites
//     it. That is an ACCEPTED LIMITATION, not an oversight and not something the cleanup below
//     fixes: two instances are an ordinary configuration here (~/.mulmoterminal is shared the same
//     way, and activity-state.ts merges rather than overwrites for exactly that reason), and the
//     alternatives — refusing the second instance, or a machine-global dispatcher daemon — are
//     each worse than the degradation. What was NOT acceptable was the silence: the takeover is
//     logged now, and the degradation is bounded to status, tool history and notifications for one
//     instance's copilot cells.
//
// DO NOT point `COPILOT_HOME` at a scratch directory to scope this per session. It relocates the
// whole config directory, `session-state/` included, so the conversation list would be reading a
// different store than the one the sessions write to — the trap `CODEX_HOME` sets for codex
// (docs/codex-vs-claude.md), with the same symptom.
//
// `type: "http"` would have removed the shell entirely and is documented; measured against 1.0.83
// it never fired, while the identical event list as `type: "command"` fired every time. Hence curl.
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { isProcessAlive } from "../../bin/instances.js";
import { isRecord } from "../../common/isRecord.js";
import { readString } from "../../common/readString.js";
import os from "node:os";
import path from "node:path";
import { COPILOT_HOOK_EVENTS } from "./copilot-hook.js";
import { messageOf } from "../errors.js";

/**
 * Is the file on disk OURS? Asked of the file's own contents, and that is the whole design.
 *
 * Ownership used to be a property of a PAIR — a marker beside the file — and each version of that
 * had a tear: whichever of the two was written first, a crash between them left the pair
 * disagreeing, and a disagreeing pair is either a file nothing may remove (so it posts to a dead
 * port forever) or a file anything may remove (so a user's own can be destroyed). Codex found both
 * halves of that on #2063, the second one in the fix for the first.
 *
 * So ownership is not a pair any more. Our file SAYS it is ours: every hook it registers posts to
 * `/api/hook` carrying `x-mt-agent: copilot`, which nothing else writes. One file, one write, no
 * pair to tear — and a torn write leaves JSON that does not parse, which is not a user's file
 * either.
 *
 * The marker beside it now answers only WHICH INSTANCE owns it, which is a question whose wrong
 * answer costs status and never costs a file.
 */
const OURS_SIGNATURE = "x-mt-agent: copilot";

/** Write through a temp file and rename. `writeFileSync` truncates first, so a crash mid-write
 *  leaves malformed JSON — which every check here reads as "not ours", so nothing would replace it
 *  and it would sit there posting to a dead port (Codex, round 2 of #2063). A rename is atomic on
 *  the platforms this ships to, so the file at that path is always a whole one. */
function writeAtomically(file: string, contents: string): void {
  const tmp = `${file}.tmp-${process.pid}`;
  try {
    writeFileSync(tmp, contents, "utf8");
    renameSync(tmp, file);
  } catch (err) {
    rmSync(tmp, { force: true });
    throw err;
  }
}

export function isOursOnDisk(home: string = copilotHome()): boolean {
  try {
    const raw: unknown = JSON.parse(readFileSync(copilotHooksFile(home), "utf8"));
    if (!isRecord(raw) || !isRecord(raw.hooks)) return false;
    const entries = Object.values(raw.hooks);
    // Every hook, not any: a file with one of ours added to a user's own is not a file to replace.
    return entries.length > 0 && entries.every((list) => Array.isArray(list) && list.every((e) => isRecord(e) && readString(e.bash).includes(OURS_SIGNATURE)));
  } catch {
    return false; // absent, unreadable, or not JSON — nothing of ours to protect
  }
}

/** Copilot's config directory, honouring the user's own `COPILOT_HOME` rather than assuming. */
export const copilotHome = (): string => process.env.COPILOT_HOME || path.join(os.homedir(), ".copilot");

/** Our file, named so a reader with several hook files knows which one to blame. */
export const copilotHooksFile = (home: string = copilotHome()): string => path.join(home, "hooks", "mulmoterminal.json");

// Naming a file is not owning it. The same pattern as the bundled-skills installer
// (server/infra/install-bundled-skills.ts): a marker beside the file says we wrote it, and a
// same-named file WITHOUT one is someone else's — left alone rather than overwritten, because a
// user's own hooks are not ours to drop (Codex review on #2063). A dotfile, so copilot's `*.json`
// scan never reads it.
const OWNER_MARKER = ".mt-owned";
const ownerMarkerFile = (home: string): string => path.join(home, "hooks", OWNER_MARKER);

// The marker carries WHO owns the file, not just THAT we do. A crash never reaches the exit
// handler below, so without the pid a leftover file is indistinguishable from a live instance's
// and nothing may safely remove it — which leaves copilot posting prompts at a port this server no
// longer holds (Codex review on #2063). With it, the next startup can tell the two apart.
interface OwnerMarker {
  pid: number;
  port: string;
}

const markerBody = (port: string | number): string => JSON.stringify({ owner: OWNER_NAME, pid: process.pid, port: String(port) }, null, 2) + "\n";

const OWNER_NAME = "mulmoterminal";

// Every field is checked, not just the one the caller reads. A marker is what licenses this code to
// DELETE or OVERWRITE a file in the user's home, so "some JSON with a numeric pid" is not a licence:
// an unrelated `.mt-owned` — or a hand-written one — would have carried it (Codex review on #2063).
const readMarker = (home: string): OwnerMarker | null => {
  try {
    const raw: unknown = JSON.parse(readFileSync(ownerMarkerFile(home), "utf8"));
    if (!isRecord(raw) || raw.owner !== OWNER_NAME) return null;
    const pid = raw.pid;
    if (typeof pid !== "number" || !Number.isInteger(pid) || pid <= 0) return null;
    const port = readString(raw.port);
    if (!port) return null;
    return { pid, port };
  } catch {
    // Absent, unreadable, or a marker from a build that wrote plain text. Not ours to act on.
    return null;
  }
};

// Small on purpose. A hook is a synchronous step in someone's turn: a server that is down must cost
// them a moment, not a minute, and must print nothing into their terminal.
const HOOK_TIMEOUT_SEC = 5;

interface HookCommand {
  type: "command";
  bash: string;
  powershell: string;
  timeoutSec: number;
}

const urlOf = (host: string, port: string | number): string => `http://${host}:${port}/api/hook`;

/** One event's command, in both shells copilot may run it under. The event name travels in a HEADER
 *  because the payload does not always carry it (measured: `permissionRequest` does, `agentStop`
 *  does not) — and the registering side always knows it. */
function commandFor(event: string, host: string, port: string | number): HookCommand {
  const url = urlOf(host, port);
  const headers = `-H 'content-type: application/json' -H 'x-mt-agent: copilot' -H 'x-mt-hook: ${event}'`;
  return {
    type: "command",
    bash: `curl -s -X POST ${url} ${headers} -d @- >/dev/null 2>&1`,
    // Untested on Windows; written to fail closed-mouthed the way the bash one does. try/catch
    // rather than -ErrorAction because a connection refused is a terminating error here.
    powershell: `$b = $input | Out-String; try { Invoke-WebRequest -Uri '${url}' -Method Post -ContentType 'application/json' -Headers @{'x-mt-agent'='copilot';'x-mt-hook'='${event}'} -Body $b -UseBasicParsing | Out-Null } catch {}`,
    timeoutSec: HOOK_TIMEOUT_SEC,
  };
}

/** The file's whole contents. Pure, so a spec can pin the shape without a filesystem. */
export function copilotHooksJson(host: string, port: string | number): string {
  const hooks: Record<string, HookCommand[]> = {};
  for (const event of COPILOT_HOOK_EVENTS) hooks[event] = [commandFor(event, host, port)];
  return JSON.stringify({ version: 1, hooks }, null, 2) + "\n";
}

/**
 * Write it, unless it is already exactly this.
 *
 * The no-op case is the common one — every boot, and every spawn, asks — and rewriting a file the
 * agent may be reading at that moment buys nothing. Failure is logged and swallowed: a home
 * directory we cannot write is a copilot session without status, which is worse than claude's but
 * far better than a spawn that refuses to start.
 */
export function syncCopilotHooksFile(host: string, port: string | number, home: string = copilotHome()): void {
  const file = copilotHooksFile(home);
  const marker = ownerMarkerFile(home);
  const next = copilotHooksJson(host, port);
  try {
    const existing = existsSync(file) ? readFileSync(file, "utf8") : null;
    if (existing === next) return;
    // Someone else's file under our name — including one that REPLACED ours while we were not
    // running, which the marker alone cannot tell from ours. Refused rather than merged: a hook
    // file is a list of commands run inside the user's agent, and rewriting one we did not write
    // is the kind of "helpful" edit that should never be automatic.
    if (existing !== null && !isOursOnDisk(home)) {
      console.warn(`[copilot] ${file} exists and was not written by MulmoTerminal — leaving it alone; copilot sessions will run without status`);
      return;
    }
    // A file of ours naming a DIFFERENT port is the other instance's (see the header). Said out
    // loud, because the loser's symptom — cells that run perfectly and report nothing — is
    // otherwise unattributable.
    if (existing !== null && !existing.includes(`:${port}/api/hook`)) {
      console.warn(`[copilot] taking over ${file} from another MulmoTerminal instance — ITS copilot cells will stop reporting status until it spawns again`);
    }
    mkdirSync(path.dirname(file), { recursive: true });
    // Order no longer matters for CORRECTNESS — ownership is read off the file itself — so the file
    // goes first and the marker follows it. A crash between them leaves our file with a stale or
    // absent owner pid, which costs at most status: the next sync still recognises the file as ours
    // and rewrites both.
    writeAtomically(file, next);
    writeFileSync(marker, markerBody(port), "utf8");
    console.log(`[copilot] hooks registered in ${file}`);
  } catch (err) {
    console.warn(`[copilot] could not write ${file} — sessions will run without status (${messageOf(err)})`);
  }
}

/**
 * Drop our hook file when this server exits.
 *
 * NOT tidiness. The file names a bare `127.0.0.1:<port>` and outlives the process that wrote it, so
 * a server that has exited leaves copilot posting every prompt and tool argument to whatever takes
 * that port next — a local program, but not this one (Codex review on #2063). Removing it is what
 * closes that, and it is why a token would not: a token stops US acting on a foreign payload, it
 * does not stop the payload being SENT.
 *
 * Only ours goes: the marker is checked exactly as the writer checks it, so a user's own file under
 * this name is not deleted by our exit any more than it is overwritten by our spawn.
 *
 * `process.on("exit")` does not run on SIGKILL or a hard crash, so a file CAN outlive a server that
 * died badly. The next spawn of any instance rewrites it with a live port, which is the ordinary
 * repair; the window is a machine where MulmoTerminal crashed and is never started again. Said out
 * loud rather than papered over.
 */
export function removeCopilotHooksFile(home: string = copilotHome()): void {
  const file = copilotHooksFile(home);
  const marker = readMarker(home);
  // OURS means this process AND this file. A peer that took the file over while we ran owns it now,
  // and an exiting instance that deleted it would leave the LIVE one's copilot cells reporting
  // nothing — the exact failure this cleanup exists to prevent, caused by the cleanup. (Found
  // reviewing my own round-1 fix, not flagged by Codex.) The content check is the other half: a
  // file replaced under our name is not ours to remove.
  if (!marker || marker.pid !== process.pid || !isOursOnDisk(home)) return;
  try {
    if (!existsSync(file) || !isOursOnDisk(home)) return; // re-read, immediately before removing
    rmSync(file, { force: true });
    rmSync(ownerMarkerFile(home), { force: true });
  } catch {
    // Exiting anyway. A file we could not remove is repaired by the next spawn's rewrite.
  }
}

/**
 * At startup: drop a hook file whose owner is GONE.
 *
 * The exit handler above covers an ordinary shutdown. It does not run on SIGKILL or a hard crash,
 * and until this existed the leftover was repaired only when someone next spawned a copilot cell —
 * so a machine that crashed and then used copilot OUTSIDE MulmoTerminal kept posting prompts at a
 * port nobody here holds. Reading the owner's pid at boot closes that without a daemon and without
 * a token (Codex review on #2063).
 *
 * A LIVE peer's file is left alone: two instances are an ordinary configuration here, and the one
 * that owns the file may be serving cells right now. Only a marker naming a dead process is
 * leftovers.
 */
export function reapStaleCopilotHooksFile(home: string = copilotHome()): void {
  const marker = readMarker(home);
  if (!marker || marker.pid === process.pid || isProcessAlive(marker.pid)) return;
  // The dead owner's marker is not enough. It survives a crash, and the user may have put their own
  // file at that path since — deleting it would be this cleanup destroying exactly what the
  // ownership rule exists to protect (Codex named this interleaving on #2063).
  if (!isOursOnDisk(home)) return;
  try {
    // Read again, immediately before removing. It does not make this atomic — nothing short of a
    // lock would — and it is here because it is free and it closes the wide window: an instance
    // that started while we were deciding has already replaced the marker by now. What the
    // remaining narrow window can produce is bounded, and the header says why.
    const now = readMarker(home);
    if (!now || now.pid !== marker.pid || !isOursOnDisk(home)) return;
    rmSync(copilotHooksFile(home), { force: true });
    rmSync(ownerMarkerFile(home), { force: true });
    console.log(`[copilot] removed a hook file left by a previous server (pid ${marker.pid}, port ${marker.port})`);
  } catch {
    // The next spawn rewrites it with a live port, which is the same repair by another route.
  }
}
