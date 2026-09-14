// The `--additional-mcp-config` payload a copilot session carries.
//
// Copilot takes the SAME `{"mcpServers": {...}}` object claude's `--mcp-config` does — measured
// against 1.0.83, which parsed it and registered the server with `"tools":["*"]` — as a JSON string
// or an `@file`. So the full-GUI case reuses `mcpConfigJson` verbatim and only the per-group case
// needs rendering, which is what this file is.
//
// `autoApprove` has no counterpart to carry: copilot approves per TOOL through `--allow-all-tools`,
// which every session here is given (copilot-args.ts), so the flag on each server is already true
// by the time it arrives.
import type { GuiMcpServer } from "./codex-args.js";

export function copilotMcpConfigJson(servers: readonly GuiMcpServer[]): string | null {
  if (servers.length === 0) return null;
  const mcpServers: Record<string, { type: string; url: string }> = {};
  for (const server of servers) mcpServers[server.id] = { type: "http", url: server.url };
  return JSON.stringify({ mcpServers });
}
