// @vitest-environment node
// agy's hook vocabulary into claude's, and the command that posts it. The command is run for real
// under `sh` against a stub curl, because what it does with an unset session is shell behaviour.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { antigravityHookBody, antigravityHookCommand, ANTIGRAVITY_HOOK_EVENTS } from "../../../../server/agents/antigravity/antigravity-hook.js";

const AGY_OWN_ID = "11723809-6245-4649-a089-d243228ab19b";
const base = { conversationId: AGY_OWN_ID, workspacePaths: ["/w", "/other"], modelName: "gemini-3.8-flash-high" };

describe("antigravityHookBody", () => {
  it("maps the turn's first model call to UserPromptSubmit, which is what drives 'working'", () => {
    expect(antigravityHookBody("PreInvocation", { ...base, invocationNum: 0, initialNumSteps: 1 })).toEqual({ hook_event_name: "UserPromptSubmit", cwd: "/w" });
  });

  it("ignores a later model call in the same turn", () => {
    expect(antigravityHookBody("PreInvocation", { ...base, invocationNum: 1 })).toBeNull();
    expect(antigravityHookBody("PreInvocation", base)).toBeNull();
    expect(antigravityHookBody("PreInvocation", { ...base, invocationNum: "0" })).toBeNull();
  });

  it("maps the turn's end to Stop, which is what drives the attention mark and the sound", () => {
    const body = antigravityHookBody("Stop", { ...base, executionNum: 0, fullyIdle: true, terminationReason: "NO_TOOL_CALL" });
    expect(body).toEqual({ hook_event_name: "Stop", cwd: "/w" });
  });

  it("never carries agy's own conversation id as the session", () => {
    expect(antigravityHookBody("Stop", base)).not.toHaveProperty("session_id");
  });

  it("leaves cwd unset when workspacePaths is missing or malformed", () => {
    expect(antigravityHookBody("Stop", { conversationId: AGY_OWN_ID })?.cwd).toBeUndefined();
    expect(antigravityHookBody("Stop", { workspacePaths: "/w" })?.cwd).toBeUndefined();
    expect(antigravityHookBody("Stop", { workspacePaths: [42] })?.cwd).toBeUndefined();
  });

  it("returns null for events it does not register, a missing name, or a non-object payload", () => {
    ["SessionStart", "PostInvocation", "PreToolUse", "PostToolUse", "stop", "__proto__", ""].forEach((name) => {
      expect(antigravityHookBody(name, { ...base, invocationNum: 0 })).toBeNull();
    });
    expect(antigravityHookBody(undefined, base)).toBeNull();
    [null, undefined, "x", 1, [base]].forEach((payload) => expect(antigravityHookBody("Stop", payload)).toBeNull());
  });

  it("translates every event it registers", () => {
    ANTIGRAVITY_HOOK_EVENTS.forEach((event) => expect(antigravityHookBody(event, { ...base, invocationNum: 0 })).not.toBeNull());
  });
});

describe.skipIf(process.platform === "win32")("antigravityHookCommand under sh", () => {
  let dir = "";
  const record = (): string => path.join(dir, "curl.log");

  let failingDir = "";

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "agy-hook-"));
    fs.writeFileSync(path.join(dir, "curl"), `#!/bin/sh\n{ printf '%s\\n' "$@"; cat; } > "${record()}"\necho ignored-output\n`, { mode: 0o755 });
    // A curl that gives up before reading its input — a refused connection, a bad option.
    failingDir = fs.mkdtempSync(path.join(os.tmpdir(), "agy-hook-fail-"));
    fs.writeFileSync(path.join(failingDir, "curl"), "#!/bin/sh\nexit 7\n", { mode: 0o755 });
  });
  afterAll(() => [dir, failingDir].forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

  // Larger than a pipe buffer, so a command that exits without reading stdin fails the write with
  // EPIPE every time rather than only when the shell happens to exit first.
  const BIG_PAYLOAD = JSON.stringify({ conversationId: "x", pad: "a".repeat(1 << 20) });

  const run = (event: (typeof ANTIGRAVITY_HOOK_EVENTS)[number], env: Record<string, string>, input = '{"conversationId":"x"}', curlDir = dir): string => {
    fs.rmSync(record(), { force: true });
    return execFileSync("/bin/sh", ["-c", antigravityHookCommand(event)], {
      input,
      env: { PATH: `${curlDir}:/usr/bin:/bin`, ...env },
    }).toString();
  };

  it("posts the payload with the session and port from the environment, and answers agy on stdout", () => {
    const stdout = run("Stop", { MULMOTERMINAL_SESSION_ID: "sid-1", MULMOTERMINAL_PORT: "4321" });
    const sent = fs.readFileSync(record(), "utf8");
    expect(sent).toContain("x-mt-agent:antigravity");
    expect(sent).toContain("x-mt-hook:Stop");
    expect(sent).toContain("x-mt-session:sid-1");
    expect(sent).toContain("http://127.0.0.1:4321/api/hook");
    expect(sent).toContain('{"conversationId":"x"}');
    expect(JSON.parse(stdout)).toEqual({ decision: "" });
  });

  it("keeps an environment value with spaces as one argument", () => {
    run("Stop", { MULMOTERMINAL_SESSION_ID: "a b -X DELETE", MULMOTERMINAL_PORT: "4321" });
    expect(fs.readFileSync(record(), "utf8").split("\n")).toContain("x-mt-session:a b -X DELETE");
  });

  it("answers PreInvocation with an empty object", () => {
    expect(JSON.parse(run("PreInvocation", { MULMOTERMINAL_SESSION_ID: "sid-1", MULMOTERMINAL_PORT: "4321" }))).toEqual({});
  });

  it("posts nothing outside a MulmoTerminal session, and still reads the payload and answers agy", () => {
    const stdout = run("Stop", { MULMOTERMINAL_PORT: "4321" }, BIG_PAYLOAD);
    expect(fs.existsSync(record())).toBe(false);
    expect(JSON.parse(stdout)).toEqual({ decision: "" });
  });

  it("still reads the payload and answers agy when curl fails without reading it", () => {
    const stdout = run("Stop", { MULMOTERMINAL_SESSION_ID: "sid-1", MULMOTERMINAL_PORT: "4321" }, BIG_PAYLOAD, failingDir);
    expect(JSON.parse(stdout)).toEqual({ decision: "" });
  });

  it("sends a large payload whole", () => {
    run("Stop", { MULMOTERMINAL_SESSION_ID: "sid-1", MULMOTERMINAL_PORT: "4321" }, BIG_PAYLOAD);
    expect(fs.readFileSync(record(), "utf8")).toContain(BIG_PAYLOAD);
  });
});
