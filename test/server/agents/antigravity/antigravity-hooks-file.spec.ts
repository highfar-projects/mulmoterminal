// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  ANTIGRAVITY_HOOK_NAME,
  antigravityHooksFile,
  mergeAntigravityHooks,
  ourAntigravityHook,
  syncAntigravityHooks,
} from "../../../../server/agents/antigravity/antigravity-hooks-file.js";
import { antigravityHookCommand } from "../../../../server/agents/antigravity/antigravity-hook.js";

const userHook = { enabled: true, PreToolUse: [{ matcher: "run_command", hooks: [{ type: "command", command: "./guard.sh" }] }] };

describe("ourAntigravityHook", () => {
  // The shape agy 1.3.5 accepted. Wrapping a matcher-less event in {"hooks":[…]} made agy drop the
  // whole file, so this pins the handlers as a direct list.
  it("lists each matcher-less event's handlers directly", () => {
    expect(ourAntigravityHook()).toEqual({
      enabled: true,
      PreInvocation: [{ type: "command", command: antigravityHookCommand("PreInvocation"), timeout: 10 }],
      Stop: [{ type: "command", command: antigravityHookCommand("Stop"), timeout: 10 }],
    });
  });
});

describe("mergeAntigravityHooks", () => {
  it("adds ours to an empty file", () => {
    expect(mergeAntigravityHooks({})).toEqual({ [ANTIGRAVITY_HOOK_NAME]: ourAntigravityHook() });
  });

  it("keeps the user's named hooks and fields untouched", () => {
    const merged = mergeAntigravityHooks({ guard: userHook, future: 1 });
    expect(merged).toEqual({ guard: userHook, future: 1, [ANTIGRAVITY_HOOK_NAME]: ourAntigravityHook() });
  });

  it("returns null when ours is already current", () => {
    expect(mergeAntigravityHooks({ guard: userHook, [ANTIGRAVITY_HOOK_NAME]: ourAntigravityHook() })).toBeNull();
  });

  it("replaces an outdated or disabled entry of ours", () => {
    const merged = mergeAntigravityHooks({ [ANTIGRAVITY_HOOK_NAME]: { enabled: false, Stop: [] } });
    expect(merged?.[ANTIGRAVITY_HOOK_NAME]).toEqual(ourAntigravityHook());
  });

  it("refuses anything that is not a JSON object", () => {
    [null, [], "x", 3, true].forEach((existing) => expect(mergeAntigravityHooks(existing)).toBeNull());
  });
});

describe("syncAntigravityHooks", () => {
  let cwd = "";
  beforeEach(() => {
    cwd = fs.mkdtempSync(path.join(os.tmpdir(), "agy-hooks-"));
  });
  afterEach(() => fs.rmSync(cwd, { recursive: true, force: true }));

  const read = (): unknown => JSON.parse(fs.readFileSync(antigravityHooksFile(cwd), "utf8"));

  it("creates .agents/hooks.json in a directory that has none", () => {
    syncAntigravityHooks(cwd);
    expect(read()).toEqual({ [ANTIGRAVITY_HOOK_NAME]: ourAntigravityHook() });
    expect(fs.readdirSync(path.join(cwd, ".agents"))).toEqual(["hooks.json"]);
  });

  it("merges into the user's file and leaves the file alone once current", () => {
    fs.mkdirSync(path.join(cwd, ".agents"));
    fs.writeFileSync(antigravityHooksFile(cwd), JSON.stringify({ guard: userHook }));
    syncAntigravityHooks(cwd);
    expect(read()).toEqual({ guard: userHook, [ANTIGRAVITY_HOOK_NAME]: ourAntigravityHook() });
    const before = fs.statSync(antigravityHooksFile(cwd)).mtimeMs;
    const text = fs.readFileSync(antigravityHooksFile(cwd), "utf8");
    syncAntigravityHooks(cwd);
    expect(fs.readFileSync(antigravityHooksFile(cwd), "utf8")).toBe(text);
    expect(fs.statSync(antigravityHooksFile(cwd)).mtimeMs).toBe(before);
  });

  it("does not rewrite a file that is not JSON", () => {
    fs.mkdirSync(path.join(cwd, ".agents"));
    fs.writeFileSync(antigravityHooksFile(cwd), "{ not json");
    syncAntigravityHooks(cwd);
    expect(fs.readFileSync(antigravityHooksFile(cwd), "utf8")).toBe("{ not json");
  });

  it.skipIf(process.platform === "win32")("does not write through a symlinked file", () => {
    const target = path.join(cwd, "elsewhere.json");
    fs.writeFileSync(target, "{}");
    fs.mkdirSync(path.join(cwd, ".agents"));
    fs.symlinkSync(target, antigravityHooksFile(cwd));
    syncAntigravityHooks(cwd);
    expect(fs.readFileSync(target, "utf8")).toBe("{}");
  });

  it("keeps the file out of git status", () => {
    fs.mkdirSync(path.join(cwd, ".git", "info"), { recursive: true });
    syncAntigravityHooks(cwd);
    expect(fs.readFileSync(path.join(cwd, ".git", "info", "exclude"), "utf8")).toContain(".agents/hooks.json");
  });
});
