// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { claudeRendererEnv } from "../../../../../server/session/spawn/agents/claude-fullscreen-env";

// A real home and project on disk, so the files read are the ones Claude Code would read.
let root: string;
let home: string;
let project: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "mt-2808-"));
  home = path.join(root, "claude-home");
  project = path.join(root, "app");
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(path.join(project, ".claude"), { recursive: true });
  vi.stubEnv("CLAUDE_CONFIG_DIR", home);
  vi.stubEnv("CLAUDE_CODE_NO_FLICKER", undefined);
  vi.stubEnv("CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN", undefined);
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

describe("claudeRendererEnv", () => {
  it("opts out when no settings file names a renderer", () => {
    fs.writeFileSync(path.join(home, "settings.json"), '{"model":"x"}');
    expect(claudeRendererEnv("s1", project)).toEqual({ CLAUDE_CODE_NO_FLICKER: "0" });
  });

  it("respects tui in the user settings", () => {
    fs.writeFileSync(path.join(home, "settings.json"), '{"tui":"fullscreen"}');
    expect(claudeRendererEnv("s1", project)).toEqual({});
  });

  it("respects tui in the project's settings and its local settings", () => {
    fs.writeFileSync(path.join(project, ".claude", "settings.json"), '{"tui":"fullscreen"}');
    expect(claudeRendererEnv("s1", project)).toEqual({});
    fs.rmSync(path.join(project, ".claude", "settings.json"));
    fs.writeFileSync(path.join(project, ".claude", "settings.local.json"), '{"tui":"fullscreen"}');
    expect(claudeRendererEnv("s1", project)).toEqual({});
  });

  it("respects the switch already set in the server's environment", () => {
    vi.stubEnv("CLAUDE_CODE_NO_FLICKER", "1");
    expect(claudeRendererEnv("s1", project)).toEqual({});
  });

  it("opts out for a directory that does not exist", () => {
    expect(claudeRendererEnv("s1", path.join(root, "missing"))).toEqual({ CLAUDE_CODE_NO_FLICKER: "0" });
  });
});
