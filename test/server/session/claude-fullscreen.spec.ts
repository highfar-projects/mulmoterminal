// @vitest-environment node
import { describe, it, expect } from "vitest";
import path from "node:path";
import { RENDERER_ENV_VARS, claudeSettingsFiles, rendererOptOutEnv, settingsChooseRenderer } from "../../../server/session/claude-fullscreen";

const OPT_OUT = { CLAUDE_CODE_NO_FLICKER: "0" };

describe("settingsChooseRenderer", () => {
  it("is true for a top-level tui naming either renderer", () => {
    expect(settingsChooseRenderer('{"tui":"fullscreen"}')).toBe(true);
    expect(settingsChooseRenderer('{"tui":"default","model":"x"}')).toBe(true);
  });

  it("decides nothing for a file without tui, a missing file, or one that does not parse", () => {
    [null, "", "{}", '{"model":"x"}', "{not json", "[]", '"tui"', "null", '{"env":{"tui":"fullscreen"}}', '{"tui":null}', '{"tui":1}'].forEach((text) =>
      expect(settingsChooseRenderer(text), String(text)).toBe(false),
    );
  });
});

describe("rendererOptOutEnv", () => {
  it("turns fullscreen off when nothing chose a renderer", () => {
    expect(rendererOptOutEnv([null, "{}", '{"model":"x"}'], {})).toEqual(OPT_OUT);
    expect(rendererOptOutEnv([], {})).toEqual(OPT_OUT);
  });

  // The env var beats an explicit "tui": "fullscreen" (measured on Claude Code 2.1.284), so passing
  // it here would undo the user's own choice.
  it("leaves a renderer chosen in any settings file alone", () => {
    expect(rendererOptOutEnv(['{"tui":"fullscreen"}', null, null], {})).toEqual({});
    expect(rendererOptOutEnv([null, null, '{"tui":"fullscreen"}'], {})).toEqual({});
    expect(rendererOptOutEnv(['{"tui":"default"}'], {})).toEqual({});
  });

  it("leaves either switch already in the environment alone, whatever its value", () => {
    RENDERER_ENV_VARS.forEach((name) => {
      ["1", "0", "", "true"].forEach((value) => expect(rendererOptOutEnv([], { [name]: value }), `${name}=${value}`).toEqual({}));
    });
  });

  it("is not swayed by unrelated variables", () => {
    expect(rendererOptOutEnv([], { HOME: "/h", CLAUDE_CONFIG_DIR: "/c", CLAUDE_CODE_TUI_TRIAL: "fullscreen" })).toEqual(OPT_OUT);
  });
});

describe("claudeSettingsFiles", () => {
  it("names the user settings in the session's home and both project settings in its directory", () => {
    expect(claudeSettingsFiles("/home/.claude", "/w/app", path.posix.join)).toEqual([
      "/home/.claude/settings.json",
      "/w/app/.claude/settings.json",
      "/w/app/.claude/settings.local.json",
    ]);
  });
});
