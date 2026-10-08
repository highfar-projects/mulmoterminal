// @vitest-environment node
import { describe, it, expect } from "vitest";
import { permissionModeChoices, permissionModeRefusal } from "../../../../server/agents/claude/claude-permission-modes.js";

// Verbatim from `claude --help` of the published 1.0.100 package: the list on the option's line.
const HELP_1_0_100 = [
  "  --append-system-prompt <prompt>                   Append a system prompt to the default system prompt",
  '  --permission-mode <mode>                          Permission mode to use for the session (choices: "acceptEdits", "bypassPermissions", "default", "plan")',
  "  -c, --continue                                    Continue the most recent conversation",
].join("\n");

// Verbatim from 2.1.283: the list wrapped, and the next option's description quoting other values.
const HELP_2_1_283 = [
  '                                        "stream-json")',
  "  --permission-mode <mode>              Permission mode to use for the session",
  '                                        (choices: "acceptEdits", "auto",',
  '                                        "bypassPermissions", "manual",',
  '                                        "dontAsk", "plan")',
  "  --permission-prompts <target>         Who answers permission prompts with",
  '                                        --print: "host" (the SDK host or',
].join("\n");

const OLD_CHOICES = ["acceptEdits", "bypassPermissions", "default", "plan"];

describe("permissionModeChoices", () => {
  it("reads the one-line list of an old Claude Code", () => {
    expect(permissionModeChoices(HELP_1_0_100)).toEqual(OLD_CHOICES);
  });

  it("reads a wrapped list, and stops before the next option", () => {
    expect(permissionModeChoices(HELP_2_1_283)).toEqual(["acceptEdits", "auto", "bypassPermissions", "manual", "dontAsk", "plan"]);
  });

  it("ignores a mention of the option inside another option's description", () => {
    const help = ['  --dangerously-skip-permissions   Same as --permission-mode "bypassPermissions"', HELP_1_0_100].join("\n");
    expect(permissionModeChoices(help)).toEqual(OLD_CHOICES);
  });

  // Without the cut at the next option, a later option's list would be read as this one's.
  it("does not borrow the choices of a later option", () => {
    const help = ["  --permission-mode <mode>   Permission mode to use", '  --output-format <format>   Output format (choices: "text", "json")'].join("\n");
    expect(permissionModeChoices(help)).toBeNull();
  });

  it.each([
    ["no such option", "  --model <model>   Model to use"],
    ["an option with no choices list", "  --permission-mode <mode>   Permission mode to use"],
    ["an empty list", "  --permission-mode <mode>   Permission mode (choices: )"],
    ["empty text", ""],
  ])("returns null for %s", (_label, help) => {
    expect(permissionModeChoices(help)).toBeNull();
  });
});

describe("permissionModeRefusal", () => {
  it("says an old Claude Code is too old for auto, and how to update it", () => {
    const refusal = permissionModeRefusal("auto", OLD_CHOICES, "claude");
    expect(refusal).toContain("too old");
    expect(refusal).toContain("`--permission-mode auto`");
    expect(refusal).toContain("acceptEdits, bypassPermissions, default, plan");
    expect(refusal).toContain("claude update");
    expect(refusal).toContain("npm install -g @anthropic-ai/claude-code@latest");
  });

  it("names the binary it asked, so a CLAUDE_BIN override is visible", () => {
    expect(permissionModeRefusal("auto", OLD_CHOICES, "/opt/claude-old/bin/claude")).toContain("/opt/claude-old/bin/claude");
  });

  it("points a non-default mode at CLAUDE_PERMISSION_MODE rather than calling the binary old", () => {
    const refusal = permissionModeRefusal("yolo", OLD_CHOICES, "claude");
    expect(refusal).toContain("CLAUDE_PERMISSION_MODE");
    expect(refusal).not.toContain("too old");
  });

  it("lets an accepted mode start", () => {
    expect(permissionModeRefusal("auto", ["acceptEdits", "auto"], "claude")).toBeNull();
    expect(permissionModeRefusal("plan", OLD_CHOICES, "claude")).toBeNull();
  });

  // An unreadable help text must never stop a cell that would have worked.
  it("lets any mode start when the choices are unknown", () => {
    expect(permissionModeRefusal("auto", null, "claude")).toBeNull();
  });
});
