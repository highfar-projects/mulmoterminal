// @vitest-environment node
// The Cloudflare base's publish and hand-over checks, run from sh the way the executor runs them. The publish check
// reads the published Worker over HTTP; here a stand-in server plays it, and a stand-in Chrome prints a fixed page, so
// what is checked is the check. (smoke.sh and security.sh start wrangler dev, and were run against a real Worker when
// they were written; they are not repeated here.)
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { createServer, type Server } from "node:http";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const CHECKS = path.join(import.meta.dirname, "..", "..", "..", "blueprints", "cloudflare", "checks");
const describeSh = describe.skipIf(process.platform === "win32");
const BUILD_ID = "build-1234";

// What the stand-in published Worker answers.
let served: { buildId: string; health: string; csp: boolean } = { buildId: BUILD_ID, health: '{"ok":true}', csp: true };

let server: Server;
let origin = "";
beforeAll(async () => {
  server = createServer((req, res) => {
    const headers: Record<string, string> = served.csp ? { "content-security-policy": "default-src 'self'; frame-ancestors 'none'" } : {};
    if (req.url === "/blueprint-build.txt") return void res.writeHead(200, headers).end(served.buildId);
    if (req.url === "/api/health") return void res.writeHead(200, { ...headers, "content-type": "application/json" }).end(served.health);
    res.writeHead(200, { ...headers, "content-type": "text/html" }).end('<html><body><div id="app">本</div></body></html>');
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  origin = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
});
afterAll(() => server.close());

let dir = "";
const put = (file: string, content: string, mode = 0o644) => {
  mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
  writeFileSync(path.join(dir, file), content, { mode });
};
beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), "bp-cloudflare-"));
  served = { buildId: BUILD_ID, health: '{"ok":true}', csp: true };
  // A stand-in Chrome that prints a page with text, so rendering is decided the same way every run. It must be
  // executable: page-renders.sh skips a CHROME it cannot run and falls through to a real browser, or to none on CI.
  put("bin/chrome", '#!/bin/sh\necho "<html><body><p>本の一覧</p></body></html>"\n', 0o755);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const run = (script: string) =>
  new Promise<{ status: number | null; stderr: string }>((resolve) => {
    const child = spawn("/bin/sh", [path.join(CHECKS, script)], { cwd: dir, env: { ...process.env, CHROME: path.join(dir, "bin/chrome") } });
    const errors: string[] = [];
    child.stderr.on("data", (chunk: Buffer) => errors.push(chunk.toString()));
    child.on("close", (status) => resolve({ status, stderr: errors.join("") }));
  });

describeSh("cloudflare: deploy-check.sh", () => {
  // The URL gate itself, before anything is fetched.
  const publish = (url: string) => {
    put(".blueprint/deploy-url", `${url}\n`);
    put(".blueprint/build-id", BUILD_ID);
  };

  it("refuses a URL that is not https", async () => {
    publish(origin);
    const result = await run("deploy-check.sh");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("is not an https URL");
  });

  it("refuses when no URL was recorded", async () => {
    put(".blueprint/build-id", BUILD_ID);
    expect((await run("deploy-check.sh")).stderr).toContain("missing .blueprint/deploy-url");
  });
});

// The rest of the publish check talks to the published URL; with https required, those paths are exercised against the
// stand-in through a copy of the script whose scheme gate accepts it. Only that one line differs.
describeSh("cloudflare: deploy-check.sh against a stand-in Worker", () => {
  const runLoose = () =>
    new Promise<{ status: number | null; stderr: string }>((resolve) => {
      const script = `sed 's#https://\\*) ;;#http://*|https://*) ;;#' "${path.join(CHECKS, "deploy-check.sh")}" > "$TMPDIR_CHECK/deploy-check.sh" && cp "${path.join(CHECKS, "page-renders.sh")}" "$TMPDIR_CHECK/" && sh "$TMPDIR_CHECK/deploy-check.sh"`;
      const scratch = mkdtempSync(path.join(os.tmpdir(), "bp-cf-check-"));
      const child = spawn("/bin/sh", ["-c", script], { cwd: dir, env: { ...process.env, CHROME: path.join(dir, "bin/chrome"), TMPDIR_CHECK: scratch } });
      const errors: string[] = [];
      child.stderr.on("data", (chunk: Buffer) => errors.push(chunk.toString()));
      child.on("close", (status) => {
        rmSync(scratch, { recursive: true, force: true });
        resolve({ status, stderr: errors.join("") });
      });
    });

  beforeEach(() => {
    put(".blueprint/deploy-url", `${origin}\n`);
    put(".blueprint/build-id", BUILD_ID);
  });

  it("passes when the published Worker serves this build, answers health, sends a CSP and renders", async () => {
    expect(await runLoose()).toEqual({ status: 0, stderr: "" });
  });

  it.each([
    ["another build", () => (served.buildId = "build-old"), "serves build build-old, this deploy made build-1234"],
    ["a failing health check", () => (served.health = '{"ok":false}'), "/api/health does not answer"],
    ["no Content-Security-Policy", () => (served.csp = false), "published without a Content-Security-Policy"],
  ])("fails when the published Worker has %s", async (_label, change, message) => {
    change();
    const result = await runLoose();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(message);
  });
});

describeSh("cloudflare: handover.sh", () => {
  const URL = "https://books.example.workers.dev";
  const README = "yarn start で動かす。yarn deploy で公開する。yarn wrangler d1 export DB --remote --output backup.sql で控える。";
  const START = `# 使い始め方\n${URL} を開く\n- [ ] 本を登録する → 一覧に出る\n`;
  const handover = (readme: string, start: string) => {
    put("README.md", readme);
    put(".blueprint/start-here.md", start);
    put(".blueprint/deploy-url", `${URL}\n`);
  };

  it("passes when the README and the first page say what they must", async () => {
    handover(README, START);
    expect((await run("handover.sh")).status).toBe(0);
  });

  it.each([
    ["how to run it here", README.replace("yarn start", "起動"), "(yarn start)"],
    ["how to publish", README.replace("yarn deploy", "公開"), "(yarn deploy)"],
    ["how to back up", README.replace("d1 export", "控え"), "(wrangler d1 export)"],
  ])("fails when the README does not say %s", async (_label, readme, message) => {
    handover(readme, START);
    const result = await run("handover.sh");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(message);
  });

  it("fails when the first page does not name the published URL, or has no checklist", async () => {
    handover(README, START.replace(URL, "https://elsewhere.example"));
    expect((await run("handover.sh")).stderr).toContain("does not name the published URL");
    handover(README, START.replace("- [ ] ", "* "));
    expect((await run("handover.sh")).stderr).toContain("has no checklist");
  });
});
