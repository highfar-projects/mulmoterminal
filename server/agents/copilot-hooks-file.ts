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
//   - Two MulmoTerminal instances on different ports share this file, and the last writer wins;
//     the other instance's sessions stop reporting. Same file, same machine — the same shape
//     ~/.mulmoterminal already has for its other shared state.
//
// DO NOT point `COPILOT_HOME` at a scratch directory to scope this per session. It relocates the
// whole config directory, `session-state/` included, so the conversation list would be reading a
// different store than the one the sessions write to — the trap `CODEX_HOME` sets for codex
// (docs/codex-vs-claude.md), with the same symptom.
//
// `type: "http"` would have removed the shell entirely and is documented; measured against 1.0.83
// it never fired, while the identical event list as `type: "command"` fired every time. Hence curl.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { COPILOT_HOOK_EVENTS } from "./copilot-hook.js";
import { messageOf } from "../errors.js";

/** Copilot's config directory, honouring the user's own `COPILOT_HOME` rather than assuming. */
export const copilotHome = (): string => process.env.COPILOT_HOME || path.join(os.homedir(), ".copilot");

/** Our file, named so a reader with several hook files knows which one to blame. */
export const copilotHooksFile = (home: string = copilotHome()): string => path.join(home, "hooks", "mulmoterminal.json");

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
  const next = copilotHooksJson(host, port);
  try {
    if (existsSync(file) && readFileSync(file, "utf8") === next) return;
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, next, "utf8");
    console.log(`[copilot] hooks registered in ${file}`);
  } catch (err) {
    console.warn(`[copilot] could not write ${file} — sessions will run without status (${messageOf(err)})`);
  }
}
