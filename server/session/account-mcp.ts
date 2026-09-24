// The GUI tool groups a CLAUDE cell on a second login is handed at spawn (#2215).
//
// A project cell normally finds its directory's GUI tools in Claude Code's own `.claude.json`,
// where the launcher's switches are written with `claude mcp add -s local`. Those commands run
// against the default login, so a cell whose CLAUDE_CONFIG_DIR points at an account reads a file
// without them. Rather than keep a copy of every switch in every account's file, the switches stay
// in ONE place and the account cell is given the directory's groups directly (see
// directoryGroupsMcpConfigJson) — the same thing a codex cell has always been given.
import { TOOL_GROUPS, type ToolGroup } from "../../common/toolGroups.js";
import { registeredGuiMcpGroups } from "../infra/gui-mcp-registration.js";
import { boundAccount } from "./account-sessions.js";
import { devTerminalCwdsHydrated, sessionCwd } from "./registry.js";

/** The directory's groups for a claude session about to SPAWN on an account, else none: a cell on
 *  the default login reads them itself, a full-GUI cell carries every tool already, and a live
 *  reattach keeps what its running process was started with. The directory is the session's own
 *  (a reconnect after a restart often arrives with no `?cwd=`), as the codex handler reads it. */
export async function accountDirectoryMcpGroups(sessionId: string, cwd: string, attachGuiMcp: boolean, live: boolean): Promise<ToolGroup[]> {
  if (attachGuiMcp || live || !boundAccount("claude", sessionId)) return [];
  await devTerminalCwdsHydrated;
  return registeredGuiMcpGroups(sessionCwd(sessionId) ?? cwd, TOOL_GROUPS).catch(() => []);
}
