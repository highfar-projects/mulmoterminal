// @vitest-environment node
import { describe, it, expect } from "vitest";
import { existsSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  copilotHooksJson,
  copilotHooksFile,
  syncCopilotHooksFile,
  removeCopilotHooksFile,
  reapStaleCopilotHooksFile,
} from "../../../server/agents/copilot-hooks-file.js";
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

  it("leaves a same-named file we did not write alone, and says so", () => {
    // Naming a file is not owning it. The repo's bundled-skill installer takes the same position
    // for the same reason (Codex review on #2063).
    const dir = home();
    mkdirSync(path.join(dir, "hooks"), { recursive: true });
    writeFileSync(copilotHooksFile(dir), '{"version":1,"hooks":{"agentStop":[{"type":"command","bash":"my own thing"}]}}', "utf8");
    syncCopilotHooksFile("127.0.0.1", 1234, dir);
    expect(readFileSync(copilotHooksFile(dir), "utf8")).toContain("my own thing");
  });

  it("survives a home it cannot write, because a spawn must not fail over a hook file", () => {
    const dir = home();
    // A FILE where the hooks directory should be: mkdir and write both fail.
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "hooks"), "not a directory");
    expect(() => syncCopilotHooksFile("127.0.0.1", 1234, dir)).not.toThrow();
  });
});

describe("removeCopilotHooksFile", () => {
  const home = () => mkdtempSync(path.join(tmpdir(), "copilot-home-"));

  it("removes OUR file on exit — a stale one points copilot's prompts at whoever takes the port", () => {
    const dir = home();
    syncCopilotHooksFile("127.0.0.1", 1234, dir);
    expect(existsSync(copilotHooksFile(dir))).toBe(true);
    removeCopilotHooksFile(dir);
    expect(existsSync(copilotHooksFile(dir))).toBe(false);
  });

  it("does NOT remove a file we never wrote", () => {
    const dir = home();
    mkdirSync(path.join(dir, "hooks"), { recursive: true });
    writeFileSync(copilotHooksFile(dir), "someone else's", "utf8");
    removeCopilotHooksFile(dir);
    expect(readFileSync(copilotHooksFile(dir), "utf8")).toBe("someone else's");
  });

  it("is a no-op when there is nothing there — it runs on every exit", () => {
    expect(() => removeCopilotHooksFile(home())).not.toThrow();
  });
});

describe("reapStaleCopilotHooksFile", () => {
  const home = () => mkdtempSync(path.join(tmpdir(), "copilot-home-"));
  const markerOf = (dir: string) => path.join(dir, "hooks", ".mt-owned");
  // A pid that cannot be running: process ids are positive, so this can only be dead.
  const DEAD_PID = 2147483646;

  it("removes a file whose owner is gone — the crash case the exit handler cannot cover", () => {
    const dir = home();
    syncCopilotHooksFile("127.0.0.1", 1234, dir);
    writeFileSync(markerOf(dir), JSON.stringify({ owner: "mulmoterminal", pid: DEAD_PID, port: "1234" }), "utf8");
    reapStaleCopilotHooksFile(dir);
    expect(existsSync(copilotHooksFile(dir))).toBe(false);
  });

  it("leaves a LIVE peer's file alone — two instances is an ordinary configuration here", () => {
    const dir = home();
    syncCopilotHooksFile("127.0.0.1", 1234, dir);
    // The marker this process just wrote names this process; a peer's would name a running one.
    reapStaleCopilotHooksFile(dir);
    expect(existsSync(copilotHooksFile(dir))).toBe(true);
  });

  it("leaves a file with no marker alone — that one is the user's, not a leftover", () => {
    const dir = home();
    mkdirSync(path.join(dir, "hooks"), { recursive: true });
    writeFileSync(copilotHooksFile(dir), "someone else's", "utf8");
    reapStaleCopilotHooksFile(dir);
    expect(readFileSync(copilotHooksFile(dir), "utf8")).toBe("someone else's");
  });
});
