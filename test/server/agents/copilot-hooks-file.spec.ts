import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { copilotHooksJson, copilotHooksFile, syncCopilotHooksFile } from "../../../server/agents/copilot-hooks-file.js";
import { COPILOT_HOOK_EVENTS } from "../../../server/agents/copilot-hook.js";

const parsed = (json: string) =>
  JSON.parse(json) as { version: number; hooks: Record<string, { type: string; bash: string; powershell: string; timeoutSec: number }[]> };

describe("copilotHooksJson", () => {
  it("registers every event the translation can act on, and nothing else", () => {
    const { hooks } = parsed(copilotHooksJson("127.0.0.1", 7654));
    expect(Object.keys(hooks).sort()).toEqual([...COPILOT_HOOK_EVENTS].sort());
  });

  it("names the event in a HEADER, because the payload does not always carry it", () => {
    // Measured: `permissionRequest` carries `hookName`, `agentStop` does not. The registering side
    // is the only thing that always knows, so it is what tells the server.
    const { hooks } = parsed(copilotHooksJson("127.0.0.1", 7654));
    for (const [event, entries] of Object.entries(hooks)) {
      expect(entries[0]?.bash).toContain(`x-mt-hook: ${event}`);
      expect(entries[0]?.powershell).toContain(`'x-mt-hook'='${event}'`);
    }
  });

  it("marks every request as copilot's, so the route knows to translate it", () => {
    const { hooks } = parsed(copilotHooksJson("127.0.0.1", 7654));
    for (const entries of Object.values(hooks)) expect(entries[0]?.bash).toContain("x-mt-agent: copilot");
  });

  it("fails quietly and quickly — a hook is a synchronous step in someone else's turn", () => {
    const { hooks } = parsed(copilotHooksJson("127.0.0.1", 7654));
    for (const entries of Object.values(hooks)) {
      expect(entries[0]?.bash).toContain(">/dev/null 2>&1");
      expect(entries[0]?.powershell).toContain("catch {}");
      expect(entries[0]?.timeoutSec).toBeLessThanOrEqual(5);
    }
  });

  it("carries BOTH shells, which copilot requires to run on all three platforms", () => {
    const { hooks } = parsed(copilotHooksJson("127.0.0.1", 7654));
    for (const entries of Object.values(hooks)) {
      expect(entries[0]?.bash).toBeTruthy();
      expect(entries[0]?.powershell).toBeTruthy();
    }
  });

  it("posts to this server's own port", () => {
    const { hooks } = parsed(copilotHooksJson("127.0.0.1", 9999));
    expect(hooks.agentStop?.[0]?.bash).toContain("http://127.0.0.1:9999/api/hook");
  });
});

describe("syncCopilotHooksFile", () => {
  const home = () => mkdtempSync(path.join(tmpdir(), "copilot-home-"));

  it("writes the file under the home it is given", () => {
    const dir = home();
    syncCopilotHooksFile("127.0.0.1", 1234, dir);
    expect(readFileSync(copilotHooksFile(dir), "utf8")).toBe(copilotHooksJson("127.0.0.1", 1234));
  });

  it("does not rewrite a file that already matches — it may be being read right now", () => {
    const dir = home();
    syncCopilotHooksFile("127.0.0.1", 1234, dir);
    const first = statSync(copilotHooksFile(dir)).mtimeMs;
    syncCopilotHooksFile("127.0.0.1", 1234, dir);
    expect(statSync(copilotHooksFile(dir)).mtimeMs).toBe(first);
  });

  it("rewrites when the port moved, which is what a second instance changes", () => {
    const dir = home();
    syncCopilotHooksFile("127.0.0.1", 1234, dir);
    syncCopilotHooksFile("127.0.0.1", 5678, dir);
    expect(readFileSync(copilotHooksFile(dir), "utf8")).toContain(":5678/api/hook");
  });

  it("survives a home it cannot write, because a spawn must not fail over a hook file", () => {
    const dir = home();
    // A FILE where the hooks directory should be: mkdir and write both fail.
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "hooks"), "not a directory");
    expect(() => syncCopilotHooksFile("127.0.0.1", 1234, dir)).not.toThrow();
  });
});
