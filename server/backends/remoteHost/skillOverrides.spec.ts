// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { hiddenSkills, hiddenSkillsFromSettings } from "./skillOverrides.js";

// Only `"off"` makes a skill unrunnable. The other three states change what claude is told about a
// skill, not whether a person can invoke it, so hiding them would remove working buttons.
describe("hiddenSkillsFromSettings", () => {
  it("hides only the skills turned off", () => {
    const settings = { skillOverrides: { gone: "off", terse: "name-only", handsOff: "user-invocable-only", fine: "on" } };
    expect([...hiddenSkillsFromSettings([settings])]).toEqual(["gone"]);
  });

  it("hides nothing when the setting is absent", () => {
    expect(hiddenSkillsFromSettings([{ theme: "dark" }, null, undefined]).size).toBe(0);
  });

  // A hand-edited settings file can hold anything. A malformed entry must not hide a skill —
  // the user would see it vanish from the menu with nothing to point at.
  it("ignores entries that are not strings, and a skillOverrides that is not a map", () => {
    expect(hiddenSkillsFromSettings([{ skillOverrides: { a: ["off"], b: null, c: 0 } }]).size).toBe(0);
    expect(hiddenSkillsFromSettings([{ skillOverrides: "off" }, { skillOverrides: [] }]).size).toBe(0);
  });

  // Later scopes win per KEY, not per file: a project file naming one skill must not discard the
  // user file's other entries.
  it("lets a later scope override one entry without dropping the rest", () => {
    const user = { skillOverrides: { deploy: "off", legacy: "off" } };
    const project = { skillOverrides: { deploy: "on" } };
    expect([...hiddenSkillsFromSettings([user, project])]).toEqual(["legacy"]);
  });

  it("lets a later scope turn one off that an earlier scope allowed", () => {
    expect([...hiddenSkillsFromSettings([{ skillOverrides: { deploy: "on" } }, { skillOverrides: { deploy: "off" } }])]).toEqual(["deploy"]);
  });
});

describe("hiddenSkills", () => {
  let userHome: string; // stands in for ~ (its .claude/skills is the user root)
  let ws: string;

  beforeEach(() => {
    userHome = mkdtempSync(path.join(tmpdir(), "mt-overrides-user-"));
    ws = mkdtempSync(path.join(tmpdir(), "mt-overrides-ws-"));
  });
  afterEach(() => {
    rmSync(userHome, { recursive: true, force: true });
    rmSync(ws, { recursive: true, force: true });
  });

  const userSkillsDir = () => path.join(userHome, ".claude", "skills");
  const writeSettings = (root: string, file: string, contents: string): void => {
    mkdirSync(path.join(root, ".claude"), { recursive: true });
    writeFileSync(path.join(root, ".claude", file), contents);
  };
  const read = () => hiddenSkills({ workspaceRoot: ws, userSkillsDir: userSkillsDir() });

  it("reads the user settings file as the sibling of the skills root", async () => {
    writeSettings(userHome, "settings.json", JSON.stringify({ skillOverrides: { deploy: "off" } }));
    expect([...(await read())]).toEqual(["deploy"]);
  });

  it("reads the project file and the local one", async () => {
    writeSettings(ws, "settings.json", JSON.stringify({ skillOverrides: { fromProject: "off" } }));
    writeSettings(ws, "settings.local.json", JSON.stringify({ skillOverrides: { fromLocal: "off" } }));
    expect([...(await read())].sort()).toEqual(["fromLocal", "fromProject"]);
  });

  // claude's own `/skills` menu writes settings.local.json, so it has to beat the file a repo
  // checked in — otherwise turning a shared project's skill back on in the menu does nothing here.
  it("lets the local file win over the project one", async () => {
    writeSettings(ws, "settings.json", JSON.stringify({ skillOverrides: { deploy: "off" } }));
    writeSettings(ws, "settings.local.json", JSON.stringify({ skillOverrides: { deploy: "on" } }));
    expect((await read()).size).toBe(0);
  });

  it("lets a project file win over the user one", async () => {
    writeSettings(userHome, "settings.json", JSON.stringify({ skillOverrides: { deploy: "on" } }));
    writeSettings(ws, "settings.json", JSON.stringify({ skillOverrides: { deploy: "off" } }));
    expect([...(await read())]).toEqual(["deploy"]);
  });

  // The ordinary case: most machines have no settings file at either scope.
  it("hides nothing when no settings file exists", async () => {
    expect((await read()).size).toBe(0);
  });

  it("hides nothing when a settings file is not valid JSON", async () => {
    writeSettings(userHome, "settings.json", "{ this is not json");
    expect((await read()).size).toBe(0);
  });
});
