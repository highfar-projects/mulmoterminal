// @vitest-environment node
// The local base's dev-proxy check: under `yarn dev` the API refuses a change whose Origin is not its own Host, so the
// Vite proxy must not rewrite the Host. The rule is tested on its own, then the check is run on real Vite configs
// loaded by this repo's Vite, as `yarn dev` would load them.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { proxyProblems } from "../../../blueprints/local/checks/devProxyRules.mjs";

const REPO = path.join(import.meta.dirname, "..", "..", "..");
const CHECK = path.join(REPO, "blueprints", "local", "checks", "dev-proxy.mjs");

describe("proxyProblems", () => {
  it("passes no proxy, and a proxy that keeps the Host", () => {
    expect(proxyProblems(undefined)).toEqual([]);
    expect(proxyProblems(null)).toEqual([]);
    expect(proxyProblems({})).toEqual([]);
    expect(proxyProblems({ "/api": { target: "http://127.0.0.1:3000", changeOrigin: false } })).toEqual([]);
    expect(proxyProblems({ "/api": { target: "http://127.0.0.1:3000" } })).toEqual([]);
  });

  it("names a proxy written as a string, which Vite gives changeOrigin: true", () => {
    const [problem] = proxyProblems({ "/api": "http://127.0.0.1:3000" });
    expect(problem).toContain('server.proxy["/api"] is the string "http://127.0.0.1:3000"');
    expect(problem).toContain('{ target: "http://127.0.0.1:3000", changeOrigin: false }');
  });

  it("names a proxy that sets the Host or Origin header itself, in any case", () => {
    expect(proxyProblems({ "/api": { target: "http://127.0.0.1:3000", headers: { HOST: "127.0.0.1:3000", Origin: "x" } } })).toEqual([
      'vite.config server.proxy["/api"] sets the HOST and Origin header itself: the API compares Origin with Host, so leave both as the browser sent them',
    ]);
    expect(proxyProblems({ "/api": { target: "http://127.0.0.1:3000", headers: { "x-trace": "1" } } })).toEqual([]);
  });

  it("names a proxy that sets changeOrigin: true, and every bad entry", () => {
    const problems = proxyProblems({
      "/api": { target: "http://127.0.0.1:3000", changeOrigin: true },
      "/files": "http://127.0.0.1:3000",
      "/ok": { target: "http://127.0.0.1:3000", changeOrigin: false },
    });
    expect(problems).toHaveLength(2);
    expect(problems[0]).toContain('server.proxy["/api"] sets changeOrigin: true');
    expect(problems[1]).toContain('server.proxy["/files"] is the string');
  });
});

describe.skipIf(process.platform === "win32")("dev-proxy.mjs on a real Vite config", () => {
  let dir = "";
  beforeEach(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), "bp-dev-proxy-"));
    writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "app", private: true, type: "module" }));
    symlinkSync(path.join(REPO, "node_modules"), path.join(dir, "node_modules"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const check = (config: string | null) => {
    if (config !== null) writeFileSync(path.join(dir, "vite.config.mjs"), config);
    const run = spawnSync(process.execPath, ["--no-warnings", CHECK], { cwd: dir, encoding: "utf8", timeout: 60_000 });
    return { status: run.status, stderr: run.stderr };
  };

  it("passes an app with no Vite config", () => {
    expect(check(null)).toEqual({ status: 0, stderr: "" });
  });

  it("refuses the string proxy the scaffold used to write, read through the config's own code", () => {
    const result = check('const PORT = process.env.PORT ?? "3000";\nexport default { server: { proxy: { "/api": `http://127.0.0.1:${PORT}` } } };\n');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('server.proxy["/api"] is the string "http://127.0.0.1:3000"');
  });

  it("reads a config kept in client/, where the scaffold puts the screens, and names its file", () => {
    mkdirSync(path.join(dir, "client"));
    writeFileSync(path.join(dir, "client", "vite.config.mjs"), 'export default { server: { proxy: { "/api": "http://127.0.0.1:3000" } } };\n');
    const result = check(null);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('client/vite.config.mjs server.proxy["/api"] is the string');
  });

  it("passes the proxy the scaffold now writes, from a config written as a function", () => {
    const config = 'export default () => ({ server: { proxy: { "/api": { target: "http://127.0.0.1:3000", changeOrigin: false } } } });\n';
    expect(check(config)).toEqual({ status: 0, stderr: "" });
  });
});
