// Registering the turn hooks (antigravity-hook.ts) where agy reads them: `.agents/hooks.json`, beside
// the skills and MCP configs this server already writes there. A map of NAMED hooks, so ours is one
// key (`mulmoterminal`) and the user's own keys are never touched.
//
// The file is shared by every session in the directory and may be the user's, so it is merged, not
// owned. It names no port and no session — both come from the agy process's environment — which is
// why it is never removed: outside a MulmoTerminal session the command posts nothing.
//
// One malformed entry makes agy drop the WHOLE file, so ours must stay in the measured shape: an
// event without a matcher (`PreInvocation`, `Stop`) takes its handlers directly. Wrapped in
// `{"hooks":[…]}` like `PreToolUse`'s, agy logs `command hook must specify 'command'` and runs no
// hook from the file at all — the user's included.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { isRecord } from "../../../common/isRecord.js";
import { symlinkFreeWriteTarget } from "../../infra/fs/symlink-guard.js";
import { excludeFromGit } from "../git-exclude.js";
import { ANTIGRAVITY_HOOK_EVENTS, antigravityHookCommand } from "./antigravity-hook.js";

const CUSTOMIZATION_DIR = ".agents";

export const ANTIGRAVITY_HOOK_NAME = "mulmoterminal";

const HOOK_TIMEOUT_S = 10;

export const antigravityHooksFile = (cwd: string): string => path.join(cwd, CUSTOMIZATION_DIR, "hooks.json");

interface HookHandler {
  type: "command";
  command: string;
  timeout: number;
}

export function ourAntigravityHook(): Record<string, unknown> {
  const handlers = ANTIGRAVITY_HOOK_EVENTS.map((event): [string, HookHandler[]] => [
    event,
    [{ type: "command", command: antigravityHookCommand(event), timeout: HOOK_TIMEOUT_S }],
  ]);
  return { enabled: true, ...Object.fromEntries(handlers) };
}

/** The merged file, or null for "do not write": not a JSON object (not ours to rewrite), or ours is
 *  already current (rewriting anyway would churn the file on every spawn). */
export function mergeAntigravityHooks(existing: unknown): Record<string, unknown> | null {
  if (!isRecord(existing)) return null;
  const ours = ourAntigravityHook();
  if (isDeepStrictEqual(existing[ANTIGRAVITY_HOOK_NAME], ours)) return null;
  return { ...existing, [ANTIGRAVITY_HOOK_NAME]: ours };
}

const EXCLUDE_ENTRY = `${CUSTOMIZATION_DIR}/hooks.json`;

function readHooksFile(file: string): unknown {
  if (!existsSync(file)) return {};
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null; // present but not JSON — someone else's file, and rewriting it would lose it
  }
}

/** Register the turn hooks for this directory's agy sessions. Idempotent, and quiet on failure: a
 *  read-only project is a reason for the cell to have no status dots, not for it to fail to start. */
export function syncAntigravityHooks(cwd: string): void {
  const file = antigravityHooksFile(cwd);
  // A checkout can commit `.agents` or the file itself as a symlink to a file of the user's own,
  // and every fs call below follows links (symlink-guard.ts).
  if (!symlinkFreeWriteTarget(file)) return;
  const merged = mergeAntigravityHooks(readHooksFile(file));
  if (merged === null) return;
  try {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(merged, null, 2) + "\n", "utf8");
    excludeFromGit(cwd, EXCLUDE_ENTRY);
  } catch (err) {
    console.warn(`[antigravity] could not write ${file}: ${err}`);
  }
}
