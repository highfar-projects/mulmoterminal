// @vitest-environment node
//
// muse's GUI MCP registration — the third shape, and the parts of it that a reader would otherwise
// have to take on trust. Everything asserted here was measured against muse-bin 0.1.0-R708.1
// before it was written down (see the module header).
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { TOOL_GROUPS } from "../../../common/toolGroups.js";
import { MUSE_PLUGIN_ID, musePluginEnv, musePluginManifest, writeMusePlugin } from "../../../server/agents/muse-mcp.js";

const BRIDGE = { command: "/opt/node/bin/node", args: ["/apps/mulmoterminal/server/mcp/bridge.mjs"] };
const PORT = 34567;

// Written once: every case builds the same manifest, and the port is part of it now.
const manifest = (bridge = BRIDGE, port: string | number = PORT) => musePluginManifest(bridge, port);

const capabilities = (manifest: Record<string, unknown>) =>
  (manifest.capabilities as { mcpServers: { id: string; transport: string; command: string[] }[] }).mcpServers;

describe("musePluginManifest", () => {
  it("declares one stdio server per tool group", () => {
    const servers = capabilities(manifest());
    expect(servers.map((s) => s.id)).toEqual([...TOOL_GROUPS]);
    expect(servers.every((s) => s.transport === "stdio")).toBe(true);
  });

  // NOTHING but argv reaches a plugin's MCP server: it is started with a curated environment of
  // muse's own, so neither an `env` block here nor the muse process's own environment arrives.
  // Both the group and the port therefore travel on the command line.
  it("passes the group and the port on the command line, after the bridge", () => {
    const render = capabilities(manifest()).find((s) => s.id === "render");
    expect(render?.command).toEqual([BRIDGE.command, ...BRIDGE.args, "--group", "render", "--port", String(PORT)]);
  });

  // A server that comes back on another port must not leave every muse cell talking to a port
  // nothing is listening on — the manifest changes, and the stamp below reads that as a reinstall.
  it("writes a different manifest when the port changes", () => {
    expect(manifest(BRIDGE, 34567)).not.toEqual(manifest(BRIDGE, 40000));
  });

  // Every group is registered whatever the directory switched on: `muse plugins install` is per
  // MACHINE, so the manifest cannot express a per-directory answer. The session's environment
  // narrows it instead (museGuiMcpEnv), and the bridge stands the rest down.
  it("registers every group, since installation cannot be per directory", () => {
    expect(capabilities(manifest())).toHaveLength(TOOL_GROUPS.length);
  });

  // muse composes the model-facing tool name out of the plugin id and the capability id
  // (`mcp__plugin_<plugin>_<server>__<tool>`, measured), so a `mulmoterminal-render` server id
  // inside a `mulmoterminal` plugin would repeat our name in every tool name in every listing.
  it("names the servers by group alone, under a plugin id that carries the app name", () => {
    expect(manifest().name).toBe(MUSE_PLUGIN_ID);
    expect(capabilities(manifest()).map((s) => s.id)).not.toContain("mulmoterminal-render");
  });

  it("declares the manifest directory muse discovers it by", () => {
    expect(manifest().compat).toMatchObject({ source: "native", manifestDir: ".muse-plugin" });
  });
});

describe("musePluginEnv", () => {
  // Every `muse plugins` verb answers "plugins are not available in this build" without it, and a
  // SESSION without it loads no plugins — so the registration would be inert rather than absent.
  it("carries the experimental flag the whole feature is behind", () => {
    expect(musePluginEnv()).toEqual({ MUSE_EXPERIMENTAL_PLUGINS: "1" });
  });
});

describe("writeMusePlugin", () => {
  let dir = "";
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "mt-muse-plugin-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("writes the manifest where muse looks for it", () => {
    writeMusePlugin(dir, manifest());
    const written: unknown = JSON.parse(readFileSync(path.join(dir, ".muse-plugin", "plugin.json"), "utf8"));
    expect(written).toEqual(manifest());
  });

  it("reports a first write as changed", () => {
    expect(writeMusePlugin(dir, manifest()).changed).toBe(true);
  });

  // The whole point of the stamp: a spawn whose manifest matches the one last installed from here
  // runs no subprocess at all, and a muse spawn is on the path of opening a cell.
  it("reports no change once the stamp records that manifest", () => {
    const { stamp } = writeMusePlugin(dir, manifest());
    writeFileSync(path.join(dir, ".installed"), `${stamp}\n`);
    expect(writeMusePlugin(dir, manifest()).changed).toBe(false);
  });

  // A mulmoterminal that moved — an upgrade, a different node — changes the bridge argv, and the
  // capability muse trusted was hashed from the old one. Re-installing is what re-approves it.
  it("reports a change when the bridge path moves", () => {
    const { stamp } = writeMusePlugin(dir, manifest());
    writeFileSync(path.join(dir, ".installed"), `${stamp}\n`);
    const moved = { command: "/usr/local/bin/node", args: ["/apps/mulmoterminal-2/server/mcp/bridge.mjs"] };
    expect(writeMusePlugin(dir, manifest(moved)).changed).toBe(true);
  });

  it("creates the manifest directory when it is not there", () => {
    const nested = path.join(dir, "a", "b");
    expect(() => writeMusePlugin(nested, manifest())).not.toThrow();
    expect(readFileSync(path.join(nested, ".muse-plugin", "plugin.json"), "utf8")).toContain(MUSE_PLUGIN_ID);
  });
});

describe("syncMuseMcpPlugin", () => {
  let dir = "";
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "mt-muse-sync-"));
    vi.restoreAllMocks();
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  // A muse that is not installed, a build with the flag gone, a read-only home: all of them are
  // reasons for a cell to have no GUI tools, and none of them a reason for the spawn to fail.
  it("answers rather than throws when the CLI is not there", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const previous = process.env.MUSE_BIN;
    process.env.MUSE_BIN = path.join(dir, "no-such-muse");
    try {
      const { syncMuseMcpPlugin } = await import("../../../server/agents/muse-mcp.js");
      expect(() => syncMuseMcpPlugin(dir)).not.toThrow();
      expect(syncMuseMcpPlugin(dir).ok).toBe(false);
    } finally {
      if (previous === undefined) delete process.env.MUSE_BIN;
      else process.env.MUSE_BIN = previous;
    }
  });

  // Failing to install must not stamp: the next spawn has to try again, or a transient failure
  // would silently cost the user their GUI tools until the manifest happened to change.
  it("does not record a stamp for a failed install", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const previous = process.env.MUSE_BIN;
    process.env.MUSE_BIN = path.join(dir, "no-such-muse");
    mkdirSync(dir, { recursive: true });
    try {
      const { syncMuseMcpPlugin } = await import("../../../server/agents/muse-mcp.js");
      syncMuseMcpPlugin(dir);
      expect(() => readFileSync(path.join(dir, ".installed"), "utf8")).toThrow();
    } finally {
      if (previous === undefined) delete process.env.MUSE_BIN;
      else process.env.MUSE_BIN = previous;
    }
  });
});
