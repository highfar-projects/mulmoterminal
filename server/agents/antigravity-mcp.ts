// The GUI MCP registration for `agy`, written where agy actually reads one per project:
// `.agents/mcp_config.json` (its workspace customization dir, discovered by walking up from the
// session's cwd).
//
// claude and codex are handed a per-session URL at spawn — `--mcp-config`, `-c mcp_servers.…`.
// agy has no such flag: it reads a FILE. That file is per DIRECTORY and shared by every session
// running there, which decides how the two moving parts are split:
//
//   - the TOOL GROUP is a property of the directory, so it goes in the entry's own `env`;
//   - the SESSION is not, so it never appears here. It reaches the bridge through the agy
//     process's environment (guiMcpEnv, set per spawn) and only there.
//
// A session id written into this file would be handed to every later session in the directory,
// which is precisely how this broke before: one stale id, minted once and then frozen, sent every
// session's tool results to a channel nobody was listening on.
//
// Claude Code's own config remains the registry of WHICH groups a directory has (see
// infra/gui-mcp-registration.ts) — one switch in the launcher, every agent. This file is derived
// from it and rewritten when a switch flips or an agy session starts; it is never read back to
// answer what is registered.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { type ToolGroup } from "../../common/toolGroups.js";
import { symlinkFreeWriteTarget } from "../infra/symlink-guard.js";
import { bridgeCommand } from "./gui-mcp-bridge.js";
import { excludeFromGit } from "./git-exclude.js";
import { mergeOurMcpServers, readMcpServers } from "./mcp-config-file.js";

/** agy's workspace customization dir. `.agent`/`_agents`/`_agent` are also accepted by agy; we write one. */
const CUSTOMIZATION_DIR = ".agents";

export const antigravityMcpConfigFile = (cwd: string): string => path.join(cwd, CUSTOMIZATION_DIR, "mcp_config.json");

export interface AntigravityMcpServer {
  command: string;
  args: string[];
  env: Record<string, string>;
}

// The merged `mcpServers` map. The TOOL GROUP rides in the entry's own `env`, which is agy's shape
// and the header's reason; everything about not clobbering the user's file is mcp-config-file.ts.
export function mergeAntigravityMcpServers(existing: Record<string, unknown>, groups: readonly ToolGroup[]): Record<string, unknown> {
  const { command, args } = bridgeCommand();
  return mergeOurMcpServers(existing, groups, (group): AntigravityMcpServer => ({ command, args, env: { MULMOTERMINAL_TOOL_GROUP: group } }));
}

// Kept out of the user's `git status` — see git-exclude.ts for why it is `.git/info/exclude` and
// not their `.gitignore`.
const EXCLUDE_ENTRY = `${CUSTOMIZATION_DIR}/mcp_config.json`;

// Point this directory's agy sessions at the GUI MCP for exactly `groups`. Idempotent, and safe
// to call on a directory that has none: the file is removed once nothing is left in it, so a
// project stops carrying a config for a feature it no longer has switched on.
export function syncAntigravityMcpConfig(cwd: string, groups: readonly ToolGroup[]): void {
  const file = antigravityMcpConfigFile(cwd);
  // Same guard as the skills config beside it: a checkout can commit `.agents` or the file
  // itself as a symlink to somewhere of the repo author's choosing, and every fs call below
  // follows links (symlink-guard.ts).
  if (!symlinkFreeWriteTarget(file)) return;
  const existing = readMcpServers(file);
  if (existing === null) return;
  const mcpServers = mergeAntigravityMcpServers(existing, groups);
  try {
    if (Object.keys(mcpServers).length === 0) {
      rmSync(file, { force: true });
      return;
    }
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify({ mcpServers }, null, 2) + "\n", "utf8");
    excludeFromGit(cwd, EXCLUDE_ENTRY);
  } catch (err) {
    // A read-only project is a reason for agy to have no GUI tools there, not for the session to
    // fail to start.
    console.warn(`[antigravity] could not write ${file}: ${err}`);
  }
}
