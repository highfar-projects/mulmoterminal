// @vitest-environment node
//
// Only the pure file-editing half: detectClaudeJsonPersistenceGap and
// applyClaudeJsonPersistenceFix. applyClaudeJsonPersistenceFixLive/hasRunningContainer shell out
// to the real `devcontainer`/`docker` CLIs and are verified live against a real container instead —
// the same split devcontainer-flag.spec.ts already draws for the same reason.
import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parse as parseJsonc } from "jsonc-parser";
import { detectClaudeJsonPersistenceGap, applyClaudeJsonPersistenceFix } from "../../../server/config/devcontainer-claude-persistence.js";

const tmp = () => mkdtempSync(path.join(tmpdir(), "mt-claude-persist-"));

function writeDevcontainer(dir: string, contents: string) {
  mkdirSync(path.join(dir, ".devcontainer"), { recursive: true });
  writeFileSync(path.join(dir, ".devcontainer", "devcontainer.json"), contents);
}

const WITH_GAP = `{
  // a comment worth preserving
  "name": "test",
  "mounts": [
    "source=my-claude-config,target=/home/vscode/.claude,type=volume"
  ]
}
`;

describe("detectClaudeJsonPersistenceGap", () => {
  it("is null for a directory with no devcontainer config", () => {
    const dir = tmp();
    try {
      expect(detectClaudeJsonPersistenceGap(dir)).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("is null when there is no mount targeting a `.claude` directory", () => {
    const dir = tmp();
    try {
      writeDevcontainer(dir, JSON.stringify({ name: "test", mounts: ["source=x,target=/opt/x,type=bind"] }));
      expect(detectClaudeJsonPersistenceGap(dir)).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("is null for a devcontainer.json with no mounts at all", () => {
    const dir = tmp();
    try {
      writeDevcontainer(dir, JSON.stringify({ name: "test" }));
      expect(detectClaudeJsonPersistenceGap(dir)).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("finds the gap: `.claude` mounted, .claude.json never mentioned", () => {
    const dir = tmp();
    try {
      writeDevcontainer(dir, WITH_GAP);
      expect(detectClaudeJsonPersistenceGap(dir)).toEqual({
        configPath: path.join(dir, ".devcontainer", "devcontainer.json"),
        claudeDirTarget: "/home/vscode/.claude",
        claudeJsonTarget: "/home/vscode/.claude.json",
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("tolerates JSONC comments and trailing commas, matching what a real devcontainer.json has", () => {
    const dir = tmp();
    try {
      writeDevcontainer(
        dir,
        `{
          // persist claude across rebuilds
          "mounts": ["source=x,target=/home/vscode/.claude,type=volume",],
        }`,
      );
      expect(detectClaudeJsonPersistenceGap(dir)).not.toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("is null once postCreateCommand already mentions .claude.json — already fixed", () => {
    const dir = tmp();
    try {
      writeDevcontainer(
        dir,
        JSON.stringify({
          mounts: ["source=x,target=/home/vscode/.claude,type=volume"],
          postCreateCommand: "ln -sf /home/vscode/.claude/.claude.json /home/vscode/.claude.json",
        }),
      );
      expect(detectClaudeJsonPersistenceGap(dir)).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("finds the gap when postCreateCommand exists but never mentions .claude.json", () => {
    const dir = tmp();
    try {
      writeDevcontainer(
        dir,
        JSON.stringify({
          mounts: ["source=x,target=/home/vscode/.claude,type=volume"],
          postCreateCommand: "sudo chown -R vscode:vscode /home/vscode/.claude",
        }),
      );
      expect(detectClaudeJsonPersistenceGap(dir)).not.toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("reads a flat .devcontainer.json the same way", () => {
    const dir = tmp();
    try {
      writeFileSync(path.join(dir, ".devcontainer.json"), JSON.stringify({ mounts: ["source=x,target=/home/vscode/.claude,type=volume"] }));
      expect(detectClaudeJsonPersistenceGap(dir)).not.toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("discards an unparsable config rather than throwing", () => {
    const dir = tmp();
    try {
      writeDevcontainer(dir, "{ not json");
      expect(detectClaudeJsonPersistenceGap(dir)).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("applyClaudeJsonPersistenceFix", () => {
  it("refuses when there is no gap to fix", () => {
    const dir = tmp();
    try {
      writeDevcontainer(dir, JSON.stringify({ name: "test" }));
      expect(applyClaudeJsonPersistenceFix(dir)).toEqual({ ok: false, message: expect.stringContaining("No persistence gap") });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("prepends the fix script to postCreateCommand, and the gap is gone afterward", () => {
    const dir = tmp();
    try {
      writeDevcontainer(dir, WITH_GAP);
      const result = applyClaudeJsonPersistenceFix(dir);
      expect(result.ok).toBe(true);
      expect(detectClaudeJsonPersistenceGap(dir)).toBeNull(); // the fix itself mentions .claude.json now

      const updated = parseJsonc(readFileSync(path.join(dir, ".devcontainer", "devcontainer.json"), "utf8")) as { postCreateCommand: string };
      expect(updated.postCreateCommand).toContain("/home/vscode/.claude.json");
      expect(updated.postCreateCommand).toContain("/home/vscode/.claude/.claude.json");
      expect(updated.postCreateCommand).toContain("/home/vscode/.claude/backups");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("preserves the file's comments and other content — a parse-and-stringify round trip would not", () => {
    const dir = tmp();
    try {
      writeDevcontainer(dir, WITH_GAP);
      applyClaudeJsonPersistenceFix(dir);
      const raw = readFileSync(path.join(dir, ".devcontainer", "devcontainer.json"), "utf8");
      expect(raw).toContain("// a comment worth preserving");
      expect(raw).toContain('"name": "test"');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("chains ahead of an EXISTING postCreateCommand rather than replacing it", () => {
    const dir = tmp();
    try {
      writeDevcontainer(
        dir,
        JSON.stringify({
          mounts: ["source=x,target=/home/vscode/.claude,type=volume"],
          postCreateCommand: "echo already-here",
        }),
      );
      applyClaudeJsonPersistenceFix(dir);
      const updated: { postCreateCommand: string } = JSON.parse(readFileSync(path.join(dir, ".devcontainer", "devcontainer.json"), "utf8"));
      expect(updated.postCreateCommand).toContain(".claude.json");
      expect(updated.postCreateCommand).toContain("echo already-here");
      expect(updated.postCreateCommand.indexOf(".claude.json")).toBeLessThan(updated.postCreateCommand.indexOf("echo already-here"));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("refuses an array-form postCreateCommand rather than guessing how to fold the fix in", () => {
    const dir = tmp();
    try {
      writeDevcontainer(
        dir,
        JSON.stringify({
          mounts: ["source=x,target=/home/vscode/.claude,type=volume"],
          postCreateCommand: { first: "echo one", second: "echo two" },
        }),
      );
      const result = applyClaudeJsonPersistenceFix(dir);
      expect(result).toEqual({ ok: false, message: expect.stringContaining("not a plain string") });
      // Untouched: refusing means refusing, not a partial edit.
      const raw = readFileSync(path.join(dir, ".devcontainer", "devcontainer.json"), "utf8");
      expect(JSON.parse(raw).postCreateCommand).toEqual({ first: "echo one", second: "echo two" });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
