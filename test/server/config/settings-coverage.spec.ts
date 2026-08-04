// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { emptyConfig, toPublicAppConfig } from "../../../server/config/app-config";

// Where a user can actually SET each global setting (#1401).
//
// The inventory that produced this found nine keys no skill documented and twelve with no control
// anywhere, so the only way to reach them was to read the guide and hand-edit JSON. Nothing failed
// while that was true: the key round-tripped through /api/config, the server acted on it, and the
// specs, typecheck and CI were all green. The gap was visible only by reading three trees at once.
//
// So this asserts the thing that has no other home: that every key the config exposes is REACHABLE.
// The map is deliberately hand-written — adding a field to AppConfig fails the first test until its
// author says where users set it, which is the moment to decide rather than the release after.
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const SETTINGS_DIR = path.join(REPO_ROOT, "src", "components", "settings");
const SKILLS_DIR = path.join(REPO_ROOT, "server", "skills");

// "ui" — a control in the Settings modal writes it.
// "skill" — a bundled skill documents how to write it.
// A key may be both; it may not be neither.
const REACHABLE_BY: Record<string, ("ui" | "skill")[]> = {
  cwdPresets: ["ui", "skill"],
  providers: ["skill"],
  soundFile: ["ui", "skill"],
  soundKinds: ["ui", "skill"],
  sounds: ["ui", "skill"],
  prRepos: ["ui", "skill"],
  gitlabHosts: ["ui", "skill"],
  repoDirs: ["ui"],
  launchers: ["ui"],
  customAgents: ["skill"],
  quickCommands: ["ui"],
  userMcpServers: ["ui"],
  themes: ["skill"],
  buttons: ["skill"],
  chips: ["skill"],
  pushEnabled: ["ui", "skill"],
  pushKinds: ["ui", "skill"],
  worklogEnabled: ["ui", "skill"],
  worklogIntervalHours: ["ui", "skill"],
  terminalSubmit: ["ui", "skill"],
  keymap: ["skill"],
  copyOnSelect: ["ui", "skill"],
  decisionDigest: ["ui", "skill"],
  issueWorkComments: ["ui", "skill"],
  prWorkdirFooter: ["ui", "skill"],
  appendSystemPrompt: ["ui", "skill"],
  cockpitLines: ["ui", "skill"],
  fontFamily: ["ui", "skill"],
};

// The settings deliberately left to a skill. Each is structured enough that a form would be a
// small editor with its own wrong-answer failure mode — a binding that steals a key the agent
// underneath needs, a palette, a key in the wrong env var, a button whose command does nothing —
// and each has a section in Settings that DISPLAYS it and launches its skill. Listed so that
// moving one into the UI is a deliberate edit here rather than something that quietly lapses.
const DELIBERATELY_SKILL_ONLY = ["keymap", "themes", "providers", "customAgents", "buttons", "chips"];

const readAll = (dir: string, ext: string): string => {
  const entries = readdirSync(dir, { withFileTypes: true, recursive: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(ext))
    .map((entry) => readFileSync(path.join(entry.parentPath, entry.name), "utf8"))
    .join("\n");
};

const uiSources = (): string => readAll(SETTINGS_DIR, ".vue") + readAll(path.join(REPO_ROOT, "src", "composables"), ".ts");
const skillSources = (): string => readAll(SKILLS_DIR, ".md");

// Every way the browser writes one config key. Matching the WRITE rather than the key name is what
// makes this test mean something: a key is mentioned in a comment, a type, a label and a guide link
// long before anything can save it, so "the string appears in the UI tree" would have passed
// throughout the gap this exists to close.
//
// Three forms, named rather than pattern-guessed. A fourth way to write config should have to be
// added here — there is no reason for there to be many.
const writesKey = (source: string, key: string): boolean =>
  source.includes(`postConfigField("${key}"`) || source.includes(`createGlobalFlag("${key}"`) || source.includes(`JSON.stringify({ ${key}:`);

describe("every global setting is reachable", () => {
  it("classifies exactly the keys the config exposes", () => {
    const exposed = Object.keys(toPublicAppConfig(emptyConfig())).sort();
    expect(Object.keys(REACHABLE_BY).sort()).toEqual(exposed);
  });

  it("names no key as unreachable", () => {
    const unreachable = Object.entries(REACHABLE_BY).filter(([, where]) => where.length === 0);
    expect(unreachable).toEqual([]);
  });

  // Proves the browser can SAVE each one. Which control does it, and that the control is wired to
  // the right field, is what the per-section specs pin.
  it("gives each ui-claimed key a write path", () => {
    const ui = uiSources();
    const missing = Object.entries(REACHABLE_BY)
      .filter(([key, where]) => where.includes("ui") && !writesKey(ui, key))
      .map(([key]) => key);
    expect(missing).toEqual([]);
  });

  // A mention is the right bar here: a skill's job is to tell the user the key and what it does,
  // and it writes the file with its own Write tool rather than through a named helper.
  it("names each skill-claimed key in a bundled skill", () => {
    const skills = skillSources();
    const missing = Object.entries(REACHABLE_BY)
      .filter(([key, where]) => where.includes("skill") && !skills.includes(key))
      .map(([key]) => key);
    expect(missing).toEqual([]);
  });

  it("keeps the structured settings with their skill", () => {
    const uiOnly = DELIBERATELY_SKILL_ONLY.filter((key) => REACHABLE_BY[key]?.includes("ui"));
    expect(uiOnly).toEqual([]);
  });
});
