// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { discoverPluginSkillIds, enabledInstalls, enabledPluginIds } from "./pluginSkills.js";

describe("enabledPluginIds", () => {
  it("merges the layers per plugin, later ones winning", () => {
    const user = { enabledPlugins: { "a@m": true, "b@m": true } };
    const project = { enabledPlugins: { "b@m": false, "c@m": true } };
    expect(enabledPluginIds([user, project, null])).toEqual(["a@m", "c@m"]);
  });

  it("ignores anything that is not a map of booleans", () => {
    expect(enabledPluginIds([null, "x", { enabledPlugins: [] }, { enabledPlugins: { "a@m": "yes", "b@m": true } }])).toEqual(["b@m"]);
  });
});

describe("enabledInstalls", () => {
  const installed = {
    version: 2,
    plugins: {
      "tools@market": [{ scope: "user", installPath: "/p/tools" }],
      "proj@market": [{ scope: "project", projectPath: "/work/app", installPath: "/p/proj" }],
      "other@market": [{ scope: "local", projectPath: "/work/other", installPath: "/p/other" }],
      "broken@market": [{ scope: "user" }],
    },
  };

  it("takes a user install anywhere and a project install only in its own directory", () => {
    const enabled = ["tools@market", "proj@market", "other@market", "broken@market", "missing@market"];
    expect(enabledInstalls(installed, enabled, "/work/app")).toEqual([
      { plugin: "tools", installPath: "/p/tools" },
      { plugin: "proj", installPath: "/p/proj" },
    ]);
  });

  it("takes the narrowest install for this directory, whatever order the file lists them in", () => {
    const user = { scope: "user", installPath: "/p/user" };
    const project = { scope: "project", projectPath: "/work/app", installPath: "/p/project" };
    const local = { scope: "local", projectPath: "/work/app", installPath: "/p/local" };
    const pick = (entries: unknown[]) => enabledInstalls({ plugins: { "t@m": entries } }, ["t@m"], "/work/app")[0]?.installPath;
    expect(pick([user, project])).toBe("/p/project");
    expect(pick([project, user])).toBe("/p/project");
    expect(pick([user, project, local])).toBe("/p/local");
    expect(pick([user])).toBe("/p/user");
  });

  it("lists nothing that is not enabled, and nothing from a malformed file", () => {
    expect(enabledInstalls(installed, [], "/work/app")).toEqual([]);
    expect(enabledInstalls(null, ["tools@market"], "/work/app")).toEqual([]);
    expect(enabledInstalls({ plugins: [] }, ["tools@market"], "/work/app")).toEqual([]);
  });
});

describe("discoverPluginSkillIds", () => {
  let home: string; // stands in for ~/.claude's parent
  let ws: string;
  const userSkillsDir = () => path.join(home, ".claude", "skills");
  const writeJson = (file: string, value: unknown) => {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(value));
  };
  const writeSkill = (root: string, name: string) => {
    mkdirSync(path.join(root, "skills", name), { recursive: true });
    writeFileSync(path.join(root, "skills", name, "SKILL.md"), "---\ndescription: x\n---\n");
  };

  beforeEach(() => {
    home = mkdtempSync(path.join(tmpdir(), "mt-plugins-home-"));
    ws = mkdtempSync(path.join(tmpdir(), "mt-plugins-ws-"));
  });
  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
    rmSync(ws, { recursive: true, force: true });
  });

  it("lists an enabled plugin's skills as plugin:skill, and skips a directory with no SKILL.md", async () => {
    const install = path.join(home, "installs", "tools");
    writeSkill(install, "deploy");
    mkdirSync(path.join(install, "skills", "notes"), { recursive: true });
    writeJson(path.join(home, ".claude", "plugins", "installed_plugins.json"), { plugins: { "tools@m": [{ scope: "user", installPath: install }] } });
    writeJson(path.join(home, ".claude", "settings.json"), { enabledPlugins: { "tools@m": true } });
    expect(await discoverPluginSkillIds({ workspaceRoot: ws, userSkillsDir: userSkillsDir() })).toEqual(["tools:deploy"]);
  });

  it("leaves out a skill directory whose name is not a slug", async () => {
    const install = path.join(home, "installs", "tools");
    writeSkill(install, "deploy");
    writeSkill(install, "has space");
    writeJson(path.join(home, ".claude", "plugins", "installed_plugins.json"), { plugins: { "tools@m": [{ scope: "user", installPath: install }] } });
    writeJson(path.join(home, ".claude", "settings.json"), { enabledPlugins: { "tools@m": true } });
    expect(await discoverPluginSkillIds({ workspaceRoot: ws, userSkillsDir: userSkillsDir() })).toEqual(["tools:deploy"]);
  });

  it("follows the project's settings: disabled there means not listed there", async () => {
    const install = path.join(home, "installs", "tools");
    writeSkill(install, "deploy");
    writeJson(path.join(home, ".claude", "plugins", "installed_plugins.json"), { plugins: { "tools@m": [{ scope: "user", installPath: install }] } });
    writeJson(path.join(home, ".claude", "settings.json"), { enabledPlugins: { "tools@m": true } });
    writeJson(path.join(ws, ".claude", "settings.local.json"), { enabledPlugins: { "tools@m": false } });
    expect(await discoverPluginSkillIds({ workspaceRoot: ws, userSkillsDir: userSkillsDir() })).toEqual([]);
  });

  it("lists nothing when there is no plugin record at all", async () => {
    expect(await discoverPluginSkillIds({ workspaceRoot: ws, userSkillsDir: userSkillsDir() })).toEqual([]);
  });
});
