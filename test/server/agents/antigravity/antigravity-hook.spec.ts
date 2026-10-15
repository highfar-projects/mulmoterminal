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

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "agy-hook-"));
    fs.writeFileSync(path.join(dir, "curl"), `#!/bin/sh\n{ printf '%s\\n' "$@"; cat; } > "${record()}"\necho ignored-output\n`, { mode: 0o755 });
  });
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  const run = (event: (typeof ANTIGRAVITY_HOOK_EVENTS)[number], env: Record<string, string>): string => {
    fs.rmSync(record(), { force: true });
    return execFileSync("/bin/sh", ["-c", antigravityHookCommand(event)], {
      input: '{"conversationId":"x"}',
      env: { PATH: `${dir}:/usr/bin:/bin`, ...env },
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

  it("answers PreInvocation with an empty object", () => {
    expect(JSON.parse(run("PreInvocation", { MULMOTERMINAL_SESSION_ID: "sid-1", MULMOTERMINAL_PORT: "4321" }))).toEqual({});
  });

  it("posts nothing outside a MulmoTerminal session, and still answers agy", () => {
    const stdout = run("Stop", { MULMOTERMINAL_PORT: "4321" });
    expect(fs.existsSync(record())).toBe(false);
    expect(JSON.parse(stdout)).toEqual({ decision: "" });
  });
});
