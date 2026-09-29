// @vitest-environment node
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const LAUNCHER = path.join(__dirname, "..", "..", "bin", "mulmoterminal.js");
const OLD_NODE = "20.13.0";
const RUN_TIMEOUT_MS = 30_000;
// Makes the launcher see an old Node without installing one: the descriptor is configurable.
const FAKE_OLD_NODE = `data:text/javascript,Object.defineProperty(process.versions,"node",{value:"${OLD_NODE}"})`;

// PATH and HOME point nowhere, so a launcher whose gate is missing or moved fails at the agent
// check instead of starting a real server.
function launch(args: string[]) {
  const home = mkdtempSync(path.join(tmpdir(), "mt-node-gate-"));
  const env = { HOME: home, USERPROFILE: home, PATH: home, CLAUDE_BIN: path.join(home, "no-claude") };
  return spawnSync(process.execPath, ["--import", FAKE_OLD_NODE, LAUNCHER, ...args], { env, encoding: "utf8", timeout: RUN_TIMEOUT_MS });
}

describe("the launcher on an unsupported Node", () => {
  it("stops a normal launch with the banner before any startup check", () => {
    const result = launch(["--no-open"]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`Node ${OLD_NODE} is not supported`);
    expect(result.stderr).toContain("#####");
    expect(`${result.stdout}${result.stderr}`).not.toMatch(/Claude Code CLI|Workspace:|Starting MulmoTerminal/);
  });

  it("still answers --version and --help", () => {
    const version = launch(["--version"]);
    expect(version.status).toBe(0);
    expect(version.stdout).toMatch(/^mulmoterminal \d/);
    const help = launch(["--help"]);
    expect(help.status).toBe(0);
    expect(help.stderr).not.toContain("not supported");
  });
});
