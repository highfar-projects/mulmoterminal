// @vitest-environment node
import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadLaunchConfigs, resolveLaunchConfig } from "../../../server/files/launchConfigs";

const tmp = () => mkdtempSync(path.join(tmpdir(), "mt-launch-configs-"));
const writeLaunchJson = (dir: string, content: string) => {
  mkdirSync(path.join(dir, ".vscode"), { recursive: true });
  writeFileSync(path.join(dir, ".vscode", "launch.json"), content);
};
// Every token is shell-quoted (server/infra/shell-quote.ts), including ones with no special
// characters — the built commands below are asserted in that already-quoted form.
const q = (v: string) => `'${v}'`;

describe("loadLaunchConfigs", () => {
  it("returns [] for a missing file", () => {
    const dir = tmp();
    expect(loadLaunchConfigs(dir)).toEqual([]);
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns [] for invalid JSON", () => {
    const dir = tmp();
    writeLaunchJson(dir, "{ not json");
    expect(loadLaunchConfigs(dir)).toEqual([]);
    rmSync(dir, { recursive: true, force: true });
  });

  // The whole point of jsonc-parser over JSON.parse: VS Code's own file allows this, and most
  // real launch.json files actually have it.
  it("tolerates comments and a trailing comma", () => {
    const dir = tmp();
    writeLaunchJson(
      dir,
      `{
        // a comment
        "version": "0.2.0",
        "configurations": [
          { "name": "Dev", "type": "node", "request": "launch", "program": "\${workspaceFolder}/index.js", },
        ],
      }`,
    );
    expect(loadLaunchConfigs(dir)).toEqual([{ label: "Dev", command: `${q("node")} ${q(path.join(dir, "index.js"))}` }]);
    rmSync(dir, { recursive: true, force: true });
  });

  it("builds a node config: program + args, ${workspaceFolder} substituted", () => {
    const dir = tmp();
    writeLaunchJson(
      dir,
      JSON.stringify({
        configurations: [{ name: "Dev server", type: "node", request: "launch", program: "${workspaceFolder}/server.js", args: ["--port", "3000"] }],
      }),
    );
    expect(loadLaunchConfigs(dir)).toEqual([{ label: "Dev server", command: `${q("node")} ${q(path.join(dir, "server.js"))} ${q("--port")} ${q("3000")}` }]);
    rmSync(dir, { recursive: true, force: true });
  });

  it("prefers runtimeExecutable over the bare node interpreter", () => {
    const dir = tmp();
    writeLaunchJson(
      dir,
      JSON.stringify({
        configurations: [{ name: "Nodemon", type: "node", request: "launch", runtimeExecutable: "nodemon", program: "index.js" }],
      }),
    );
    expect(loadLaunchConfigs(dir)).toEqual([{ label: "Nodemon", command: `${q("nodemon")} ${q("index.js")}` }]);
    rmSync(dir, { recursive: true, force: true });
  });

  it("builds a python module config with -m", () => {
    const dir = tmp();
    writeLaunchJson(dir, JSON.stringify({ configurations: [{ name: "Flask", type: "debugpy", request: "launch", module: "flask", args: ["run"] }] }));
    expect(loadLaunchConfigs(dir)).toEqual([{ label: "Flask", command: `${q("python3")} -m ${q("flask")} ${q("run")}` }]);
    rmSync(dir, { recursive: true, force: true });
  });

  it("builds a python program config", () => {
    const dir = tmp();
    writeLaunchJson(dir, JSON.stringify({ configurations: [{ name: "Script", type: "python", request: "launch", program: "main.py" }] }));
    expect(loadLaunchConfigs(dir)).toEqual([{ label: "Script", command: `${q("python3")} ${q("main.py")}` }]);
    rmSync(dir, { recursive: true, force: true });
  });

  it("falls back generically for an unrecognized type with a program", () => {
    const dir = tmp();
    writeLaunchJson(dir, JSON.stringify({ configurations: [{ name: "Go run", type: "go", request: "launch", program: "./cmd/server" }] }));
    expect(loadLaunchConfigs(dir)).toEqual([{ label: "Go run", command: q("./cmd/server") }]);
    rmSync(dir, { recursive: true, force: true });
  });

  it("carries env as an `env NAME=value` prefix", () => {
    const dir = tmp();
    writeLaunchJson(
      dir,
      JSON.stringify({
        configurations: [{ name: "Dev", type: "node", request: "launch", program: "index.js", env: { NODE_ENV: "development", PORT: "4000" } }],
      }),
    );
    expect(loadLaunchConfigs(dir)).toEqual([{ label: "Dev", command: `env NODE_ENV=${q("development")} PORT=${q("4000")} ${q("node")} ${q("index.js")}` }]);
    rmSync(dir, { recursive: true, force: true });
  });

  it("resolves a relative cwd against the workspace root and carries it", () => {
    const dir = tmp();
    mkdirSync(path.join(dir, "backend"));
    writeLaunchJson(dir, JSON.stringify({ configurations: [{ name: "Backend", type: "node", request: "launch", program: "index.js", cwd: "backend" }] }));
    expect(loadLaunchConfigs(dir)).toEqual([{ label: "Backend", command: `${q("node")} ${q("index.js")}`, cwd: "backend" }]);
    rmSync(dir, { recursive: true, force: true });
  });

  it("excludes an attach configuration — nothing to launch", () => {
    const dir = tmp();
    writeLaunchJson(dir, JSON.stringify({ configurations: [{ name: "Attach", type: "node", request: "attach", port: 9229 }] }));
    expect(loadLaunchConfigs(dir)).toEqual([]);
    rmSync(dir, { recursive: true, force: true });
  });

  it("excludes a configuration needing an unsupported (editor-context) variable", () => {
    const dir = tmp();
    writeLaunchJson(dir, JSON.stringify({ configurations: [{ name: "Current file", type: "node", request: "launch", program: "${file}" }] }));
    expect(loadLaunchConfigs(dir)).toEqual([]);
    rmSync(dir, { recursive: true, force: true });
  });

  it("excludes a configuration that needs an interactive ${input:...} prompt", () => {
    const dir = tmp();
    writeLaunchJson(
      dir,
      JSON.stringify({ configurations: [{ name: "Pick a port", type: "node", request: "launch", program: "index.js", args: ["${input:port}"] }] }),
    );
    expect(loadLaunchConfigs(dir)).toEqual([]);
    rmSync(dir, { recursive: true, force: true });
  });

  it("excludes a configuration with no program and no runtimeExecutable (e.g. a browser launch)", () => {
    const dir = tmp();
    writeLaunchJson(dir, JSON.stringify({ configurations: [{ name: "Launch Chrome", type: "chrome", request: "launch", url: "http://localhost:3000" }] }));
    expect(loadLaunchConfigs(dir)).toEqual([]);
    rmSync(dir, { recursive: true, force: true });
  });

  it("does not read compounds", () => {
    const dir = tmp();
    writeLaunchJson(
      dir,
      JSON.stringify({
        configurations: [{ name: "Server", type: "node", request: "launch", program: "server.js" }],
        compounds: [{ name: "Full stack", configurations: ["Server", "Client"] }],
      }),
    );
    expect(loadLaunchConfigs(dir).map((c) => c.label)).toEqual(["Server"]);
    rmSync(dir, { recursive: true, force: true });
  });

  it("keeps runnable entries and drops unsupported ones from the same file", () => {
    const dir = tmp();
    writeLaunchJson(
      dir,
      JSON.stringify({
        configurations: [
          { name: "Server", type: "node", request: "launch", program: "server.js" },
          { name: "Attach", type: "node", request: "attach" },
        ],
      }),
    );
    expect(loadLaunchConfigs(dir).map((c) => c.label)).toEqual(["Server"]);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("resolveLaunchConfig", () => {
  it("resolves a command and defaults cwd to the workspace root", () => {
    const dir = tmp();
    writeLaunchJson(dir, JSON.stringify({ configurations: [{ name: "Server", type: "node", request: "launch", program: "server.js" }] }));
    expect(resolveLaunchConfig(dir, 0)).toEqual({ command: `${q("node")} ${q("server.js")}`, cwd: dir });
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns null for an out-of-range or non-integer index", () => {
    const dir = tmp();
    writeLaunchJson(dir, JSON.stringify({ configurations: [{ name: "Server", type: "node", request: "launch", program: "server.js" }] }));
    expect(resolveLaunchConfig(dir, 1)).toBeNull();
    expect(resolveLaunchConfig(dir, -1)).toBeNull();
    expect(resolveLaunchConfig(dir, 0.5)).toBeNull();
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns null when the resolved cwd does not exist", () => {
    const dir = tmp();
    writeLaunchJson(dir, JSON.stringify({ configurations: [{ name: "Gone", type: "node", request: "launch", program: "x.js", cwd: "nope" }] }));
    expect(resolveLaunchConfig(dir, 0)).toBeNull();
    rmSync(dir, { recursive: true, force: true });
  });
});
