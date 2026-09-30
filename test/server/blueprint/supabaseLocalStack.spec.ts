// @vitest-environment node
// local-stack.sh, sourced the way the Supabase checks source it, with a stand-in yarn that records what it is asked to
// do and a stand-in docker that lists the running containers.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const LOCAL_STACK = path.join(import.meta.dirname, "..", "..", "..", "blueprints", "supabase", "checks", "local-stack.sh");
const describeSh = describe.skipIf(process.platform === "win32");

const STANDIN_YARN = `#!/bin/sh
echo "yarn $*" >> "$STANDIN_LOG"
[ "$*" = "-s db:start" ] && [ -n "$STANDIN_START_FAILS" ] && { echo "port 54322 is already allocated"; exit 1; }
exit 0
`;
const STANDIN_DOCKER = `#!/bin/sh
printf '%s' "$STANDIN_CONTAINERS"
`;

let dir = "";
const put = (file: string, content: string) => {
  mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
  writeFileSync(path.join(dir, file), content, { mode: 0o755 });
};
const config = (signUp: boolean) => put("supabase/config.toml", `project_id = "books"\n\n[auth]\nenable_signup = ${signUp}\n`);

beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), "bp-local-stack-"));
  put("bin/yarn", STANDIN_YARN);
  put("bin/docker", STANDIN_DOCKER);
  config(true);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

// Sources the script and returns what yarn was asked, one run's calls at a time.
function localStack(env: Record<string, string> = {}) {
  rmSync(path.join(dir, "calls.log"), { force: true });
  const result = spawnSync("/bin/sh", ["-c", `set -eu; . "${LOCAL_STACK}"`], {
    cwd: dir,
    env: {
      ...process.env,
      PATH: `${path.join(dir, "bin")}:${process.env.PATH ?? ""}`,
      STANDIN_LOG: path.join(dir, "calls.log"),
      STANDIN_CONTAINERS: "",
      ...env,
    },
    encoding: "utf8",
  });
  const calls = readFileSync(path.join(dir, "calls.log"), "utf8").trim().split("\n");
  return { status: result.status, stderr: result.stderr, calls };
}

const STOP = "yarn -s supabase stop";
const START = "yarn -s db:start";
const RESET = "yarn -s supabase db reset";

describeSh("supabase: local-stack.sh", () => {
  it("stops the stack before the first start, since what config it was started with is not known", () => {
    expect(localStack()).toEqual({ status: 0, stderr: "", calls: [STOP, START, RESET] });
  });

  it("leaves a stack it started from the same config running, and restarts it when the config changed", () => {
    localStack();
    expect(localStack().calls).toEqual([START, RESET]);
    config(false);
    expect(localStack().calls).toEqual([STOP, START, RESET]);
    expect(localStack().calls).toEqual([START, RESET]);
  });

  it("does not take a failed start as the config being applied", () => {
    localStack();
    config(false);
    expect(localStack({ STANDIN_START_FAILS: "1" }).status).toBe(1);
    expect(localStack().calls).toEqual([STOP, START, RESET]);
  });

  it("names another project's running stack when the start fails, and not this project's own", () => {
    const containers = "supabase_db_books\nsupabase_kong_books\nsupabase_db_reading-log\nsupabase_db_shop\ncompass\n";
    const result = localStack({ STANDIN_START_FAILS: "1", STANDIN_CONTAINERS: containers });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("another project's local Supabase stack is running (reading-log shop) and may hold the same ports");
    expect(result.stderr).toContain("port 54322 is already allocated");
    expect(result.calls).not.toContain(RESET);
  });

  it("asks about Docker when no other stack is running", () => {
    const result = localStack({ STANDIN_START_FAILS: "1", STANDIN_CONTAINERS: "supabase_db_books\n" });
    expect(result.stderr).toContain("the local Supabase stack did not start (is Docker Desktop running?)");
    expect(result.stderr).not.toContain("another project");
  });
});
