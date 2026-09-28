// @vitest-environment node
import { describe, it, expect } from "vitest";
import { chmodSync, mkdtempSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createPermissionModeProbe, refuseUnsupportedPermissionMode, type RunHelp } from "../../../server/agents/claude-help-probe.js";
import { SpawnPermissionModeError, SpawnRefusedError } from "../../../server/session/pty-spawn.js";

const OLD_HELP = '  --permission-mode <mode>   Permission mode (choices: "acceptEdits", "bypassPermissions", "default", "plan")\n  -c, --continue   Continue';
const NEW_HELP = '  --permission-mode <mode>   Permission mode (choices: "acceptEdits", "auto", "plan")\n  -c, --continue   Continue';

// An executable file for the probe to find; what it prints comes from the injected runner.
function fakeBinary(): string {
  const file = path.join(mkdtempSync(path.join(tmpdir(), "mt-claude-help-")), "claude");
  writeFileSync(file, "#!/bin/sh\n");
  chmodSync(file, 0o755);
  return file;
}

function countingRunner(helpText: string, status = 0): { run: RunHelp; calls: () => number } {
  let count = 0;
  const run: RunHelp = () => {
    count += 1;
    return { status, stdout: helpText, stderr: "" };
  };
  return { run, calls: () => count };
}

describe("createPermissionModeProbe", () => {
  it("reads the accepted modes from the binary's help", () => {
    const { run } = countingRunner(OLD_HELP);
    expect(createPermissionModeProbe(run)(fakeBinary(), process.env)).toEqual(["acceptEdits", "bypassPermissions", "default", "plan"]);
  });

  it("asks a binary once, and again after it is replaced", () => {
    const bin = fakeBinary();
    const { run, calls } = countingRunner(NEW_HELP);
    const probe = createPermissionModeProbe(run);
    probe(bin, process.env);
    probe(bin, process.env);
    expect(calls()).toBe(1);
    const later = new Date(Date.now() + 60_000);
    utimesSync(bin, later, later);
    probe(bin, process.env);
    expect(calls()).toBe(2);
  });

  it.each([
    ["a non-zero exit", countingRunner(OLD_HELP, 1).run],
    [
      "a runner that throws",
      (() => {
        throw new Error("spawn failed");
      }) satisfies RunHelp,
    ],
    ["help it cannot read", countingRunner("Usage: claude [options]").run],
  ])("returns null for %s", (_label, run) => {
    expect(createPermissionModeProbe(run)(fakeBinary(), process.env)).toBeNull();
  });

  it("does not run anything for a binary that is not there", () => {
    const { run, calls } = countingRunner(OLD_HELP);
    expect(createPermissionModeProbe(run)(path.join(tmpdir(), "no-such-dir", "claude"), process.env)).toBeNull();
    expect(calls()).toBe(0);
  });
});

// The real runner against a script that prints an old Claude Code's help, as `CLAUDE_BIN` would name it.
describe.skipIf(process.platform === "win32")("refuseUnsupportedPermissionMode", () => {
  function scriptPrinting(helpText: string): string {
    const file = fakeBinary();
    writeFileSync(file, `#!/bin/sh\ncat <<'HELP'\n${helpText}\nHELP\n`);
    return file;
  }

  it("refuses auto on an old Claude Code with an error the cell shows as-is", () => {
    const bin = scriptPrinting(OLD_HELP);
    let thrown: unknown = null;
    try {
      refuseUnsupportedPermissionMode(bin, "auto", process.env);
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(SpawnPermissionModeError);
    expect(thrown).toBeInstanceOf(SpawnRefusedError);
    expect(String(thrown)).toContain("too old");
  });

  // The cell's PATH is sanitized, so the probe must look `claude` up on the env the CHILD gets —
  // an old one earlier on the server's own PATH must not refuse a cell that would start a new one.
  it("asks the claude the given env resolves, not the one on process.env", () => {
    const oldDir = path.dirname(scriptPrinting(OLD_HELP));
    const newDir = path.dirname(scriptPrinting(NEW_HELP));
    expect(() => refuseUnsupportedPermissionMode("claude", "auto", { PATH: newDir })).not.toThrow();
    expect(() => refuseUnsupportedPermissionMode("claude", "auto", { PATH: oldDir })).toThrow(SpawnPermissionModeError);
  });

  it("lets a current Claude Code start", () => {
    expect(() => refuseUnsupportedPermissionMode(scriptPrinting(NEW_HELP), "auto", process.env)).not.toThrow();
  });
});
