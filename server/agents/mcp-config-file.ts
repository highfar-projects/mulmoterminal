// Reading and merging the `mcpServers` map of a per-DIRECTORY MCP config file.
//
// Two agents are registered through one: agy (`.agents/mcp_config.json`) and cursor
// (`.cursor/mcp.json`). The file belongs to the USER and may hold servers we know nothing about, so
// both owe it the same two rules — read it without resolving through Object.prototype, and replace
// only the ids that are ours. The rules live here rather than in each agent for own-assign.ts's
// reason: a second copy is how one of them ends up subtly different.
//
// What an entry LOOKS like is not shared, because it genuinely differs: agy carries the tool group
// in the entry's `env`, cursor in its argv (cursor-mcp.ts has the measurement behind that).
import { existsSync, readFileSync } from "node:fs";
import { isRecord } from "../../common/isRecord.js";
import { toolGroupServerId, type ToolGroup } from "../../common/toolGroups.js";
import { assignOwn } from "../infra/own-assign.js";
import { OUR_GUI_SERVER_IDS } from "./gui-mcp-bridge.js";

/** The file's `mcpServers` map — `{}` when there is no file, `null` when there is one we must not
 *  rewrite. Read with own-property checks: a key like `constructor` in the user's file must not
 *  resolve through Object.prototype (same reason as common/toolGroups.ts). */
export function readMcpServers(file: string): Record<string, unknown> | null {
  if (!existsSync(file)) return {};
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
    if (!isRecord(parsed)) return null;
    const servers = Object.prototype.hasOwnProperty.call(parsed, "mcpServers") ? parsed.mcpServers : {};
    return isRecord(servers) ? { ...servers } : {};
  } catch {
    return null; // present but not JSON — someone else's file, and rewriting it would lose it
  }
}

/** The merged map: the user's own entries untouched, ours replaced by exactly the groups given — so
 *  an entry for a group that was switched OFF is removed rather than left behind. Pure, so the
 *  "never clobber a server we don't own" rule is testable without a filesystem.
 *
 *  Which ids are ours is `OUR_GUI_SERVER_IDS`, shared with grok's config-file path, which owes the
 *  user's file the same restraint — see gui-mcp-bridge.ts for what is in it and why the all-tools id
 *  is not. */
export function mergeOurMcpServers<Server>(
  existing: Record<string, unknown>,
  groups: readonly ToolGroup[],
  serverFor: (group: ToolGroup) => Server,
): Record<string, unknown> {
  // `assignOwn`, not `merged[id] = …`: `JSON.parse` can hand us an OWN `__proto__` key, and
  // assigning THAT id runs Object.prototype's setter instead of creating a property — so the user's
  // server would silently vanish from the file we write back (CodeRabbit on #2070).
  const merged: Record<string, unknown> = {};
  for (const id of Object.keys(existing)) {
    if (!OUR_GUI_SERVER_IDS.has(id)) assignOwn(merged, id, existing[id]);
  }
  for (const group of groups) {
    assignOwn(merged, toolGroupServerId(group), serverFor(group));
  }
  return merged;
}
