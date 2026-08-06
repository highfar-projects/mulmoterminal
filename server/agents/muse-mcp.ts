// The GUI MCP registration for `muse`, which reaches MCP through neither a flag nor a file in the
// project but through a PLUGIN — the third shape, and the reason this file looks like neither
// grok-mcp.ts nor antigravity-mcp.ts.
//
// What muse offers (measured against muse-bin 0.1.0-R708.1, 2026-08-06):
//
//   A plugin is a directory with `.muse-plugin/plugin.json`, whose `capabilities.mcpServers` is a
//   list of `{ id, transport: "stdio", command }`. `muse plugins install <dir>` copies it into a
//   content-addressed cache and records it; `muse plugins approve <id>` trusts the capability, and
//   only then does a session start the server. `streamable_http` parses but is not wired yet
//   ("streamable HTTP transport startup is not wired yet"), so stdio — our bridge — is the transport.
//
// THREE consequences shape everything below, and each of them is why some part of this is not just
// grok's file with different words:
//
//   1. INSTALLATION IS PER MACHINE. `--scope project` writes nothing into the project (measured:
//      installing from one directory left it untouched and the plugin was listed from another), so
//      a per-directory registration cannot be expressed by installing and removing. All four group
//      servers are therefore registered once, and the SESSION decides which of them serve: the
//      spawn records the directory's groups against the session id, the bridge asks for them when
//      it resolves itself, and one whose group is not among them stands down with an empty toolset
//      (server/mcp/bridge.mjs). The directory's own switches still govern — they are read from the
//      same place claude's, agy's and grok's are.
//
//   2. NOTHING REACHES THE SERVER BUT ITS COMMAND LINE. A plugin's MCP server is started with a
//      CURATED ENVIRONMENT — measured at 16 variables, all of muse's own choosing — so neither the
//      muse process's environment nor an `env` block in this manifest arrives (both were measured:
//      the block validates, and then the server sees neither it nor anything of ours). So the group
//      and the port are argv, and the SESSION — which cannot be baked into a machine-wide manifest
//      anyway — is asked for at runtime: the bridge maps its own pid back to the session whose tmux
//      pane it runs under (server/session/bridge-session.ts).
//
//   3. PLUGINS ARE BEHIND AN EXPERIMENTAL FLAG. Without `MUSE_EXPERIMENTAL_PLUGINS=1` every
//      `muse plugins` verb answers "plugins are not available in this build". It is set on the CLI
//      calls here AND on the session spawn, and its absence is a reason for a muse cell to have no
//      GUI tools — never a reason for it to fail to start. A build that drops the flag makes every
//      call below fail, which lands in the same warning as a build with no plugin support at all.
//
// The SERVER IDS are the group names alone (`render`, `data`, …) rather than
// `toolGroupServerId()`'s `mulmoterminal-<group>`, and that divergence is deliberate. Those ids are
// long because they are keys in files USERS wrote, which is what makes renaming them a migration
// (common/toolGroups.ts). Nothing user-written names these: the manifest is generated here, and
// muse composes the tool name from the plugin id and the capability id — so
// `mcp__plugin_mulmoterminal_render__presentChart`, where the ids in `toolGroupServerId()` form
// would repeat our name in every tool name, in every listing, in every session.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { TOOL_GROUPS } from "../../common/toolGroups.js";
import { PORT } from "../config/env.js";
import { mulmoterminalHome } from "../infra/mulmoterminal-home.js";
import { spawnCapture } from "../infra/spawnCapture.js";
import { bridgeCommand } from "./gui-mcp-bridge.js";
import { museAdapter } from "./muse.js";

/** The plugin id, which muse puts in every tool name — hence the short one. */
export const MUSE_PLUGIN_ID = "mulmoterminal";

/** The bundle we generate and hand to `muse plugins install`. Under our own config directory
 *  rather than in the user's project: there is one installation per machine, so a copy per
 *  directory would be four copies of the same thing and three of them stale. */
export const musePluginDir = (): string => path.join(mulmoterminalHome(), "muse-plugin");

/** The flag every `muse plugins` call needs; see the header. */
export const musePluginEnv = (): Record<string, string> => ({ MUSE_EXPERIMENTAL_PLUGINS: "1" });

/** What muse is told this plugin is. Pure, so the manifest a spec asserts on is the manifest that
 *  gets written — including the argv, which is where the group AND the port live (see 2. above:
 *  argv is the only channel that reaches the server this registers). */
export function musePluginManifest(bridge: { command: string; args: string[] }, port: string | number): Record<string, unknown> {
  return {
    schemaVersion: 1,
    name: MUSE_PLUGIN_ID,
    displayName: "MulmoTerminal",
    version: "1.0.0",
    description: "MulmoTerminal's GUI tools — the Canvas, workspace data, media and external accounts.",
    compat: { source: "native", manifestDir: ".muse-plugin" },
    capabilities: {
      skills: [],
      commands: [],
      hooks: [],
      reminders: [],
      // Every group, always. Which of them a session may actually reach is decided per session
      // (see 1. in the header), because installation cannot express it.
      mcpServers: TOOL_GROUPS.map((group) => ({
        id: group,
        transport: "stdio",
        // The PORT is baked in because nothing else can carry it: the environment a plugin server
        // is started with holds none of ours. A server that comes back on a different port writes a
        // different manifest, which the stamp below reads as a change and re-installs.
        command: [bridge.command, ...bridge.args, "--group", group, "--port", String(port)],
      })),
    },
  };
}

const manifestPath = (dir: string): string => path.join(dir, ".muse-plugin", "plugin.json");
/** What we last successfully installed, so an unchanged manifest costs no subprocess. */
const stampPath = (dir: string): string => path.join(dir, ".installed");

const digest = (text: string): string => createHash("sha256").update(text).digest("hex");

/** Write the bundle, and say whether it differs from the one already installed from here.
 *  Separated from the install so the decision is testable without a muse on PATH. */
export function writeMusePlugin(dir: string, manifest: Record<string, unknown>): { changed: boolean; stamp: string } {
  const text = `${JSON.stringify(manifest, null, 2)}\n`;
  const stamp = digest(text);
  mkdirSync(path.dirname(manifestPath(dir)), { recursive: true });
  writeFileSync(manifestPath(dir), text);
  return { changed: lastInstalled(dir) !== stamp, stamp };
}

/** The stamp of the manifest last installed FROM THIS DIRECTORY, or null when there is none —
 *  a first run, or a home that has been cleared. */
function lastInstalled(dir: string): string | null {
  try {
    return readFileSync(stampPath(dir), "utf8").trim();
  } catch {
    return null;
  }
}

function runMusePlugins(args: string[]): { ok: boolean; message: string } {
  const { status, stdout, stderr } = spawnCapture(museAdapter.bin(), ["plugins", ...args], { env: { ...process.env, ...musePluginEnv() } });
  return { ok: status === 0, message: [stdout, stderr].filter(Boolean).join("\n").trim() };
}

/**
 * Make this machine's muse able to reach the GUI tools. Idempotent, and free once done: a manifest
 * identical to the one last installed from here spawns nothing at all.
 *
 * Both verbs are needed and in this order — install records the plugin, approve trusts the
 * capability definitions by their hash, and an unapproved capability is listed but never started.
 * Re-running approve after a changed manifest is not optional for the same reason: the hash it
 * trusted was the old definition's.
 *
 * Never throws. A muse that is not installed, a build without the plugin flag, and a read-only
 * config directory are all reasons for a cell to have no GUI tools — none of them a reason for the
 * session not to start.
 */
export function syncMuseMcpPlugin(dir = musePluginDir()): { ok: boolean; message: string } {
  try {
    const { changed, stamp } = writeMusePlugin(dir, musePluginManifest(bridgeCommand(), PORT));
    if (!changed) return { ok: true, message: "" };

    const installed = runMusePlugins(["install", dir, "--scope", "user", "--json"]);
    if (!installed.ok) return warn(installed.message);
    const approved = runMusePlugins(["approve", MUSE_PLUGIN_ID, "--json"]);
    if (!approved.ok) return warn(approved.message);

    writeFileSync(stampPath(dir), `${stamp}\n`);
    console.log(`[muse] registered the GUI MCP plugin (${TOOL_GROUPS.length} tool groups)`);
    return { ok: true, message: "" };
  } catch (err) {
    return warn(String(err));
  }
}

function warn(message: string): { ok: boolean; message: string } {
  // One line, and it names the flag: "plugins are not available in this build" is the message a
  // reader will otherwise search for and find nothing about.
  console.warn(`[muse] could not register the GUI MCP plugin — muse cells will have no GUI tools: ${message}`);
  return { ok: false, message };
}
