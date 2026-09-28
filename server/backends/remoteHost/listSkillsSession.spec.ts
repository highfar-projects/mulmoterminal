// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { createListSkills, sessionSkillRoot, type SkillSessionLookup } from "./handlers/listSkills.js";
import type { JsonObject } from "@mulmoclaude/core/remote-host";
import { initCollectionsBackend } from "../collections.js";

// #2358. A sessionId asks for the skills THAT session can run: its own directory's, plus its
// enabled plugins'. Absent, the list is the workspace's as before.
const SESSION = "11111111-2222-4333-8444-555555555555";
const lookupOf = (cwd: string, agent: ReturnType<SkillSessionLookup["agent"]>): SkillSessionLookup => ({ cwd: () => cwd, agent: () => agent });

describe("sessionSkillRoot", () => {
  it("is null with no session named", () => {
    expect(sessionSkillRoot({}, lookupOf("/work/app", "claude"))).toBeNull();
  });

  it("is the session's directory for a claude session, and for one whose agent is unknown", () => {
    expect(sessionSkillRoot({ sessionId: SESSION }, lookupOf("/work/app", "claude"))).toBe("/work/app");
    expect(sessionSkillRoot({ sessionId: SESSION }, lookupOf("/work/app", null))).toBe("/work/app");
  });

  it("is null for another agent's session, which calls skills differently", () => {
    expect(sessionSkillRoot({ sessionId: SESSION }, lookupOf("/work/app", "codex"))).toBeNull();
  });

  it("refuses an id that is not a session id, and a session the host does not know", () => {
    expect(() => sessionSkillRoot({ sessionId: "mt-abc" }, lookupOf("/work/app", "claude"))).toThrow("sessionId is not a session id");
    expect(() => sessionSkillRoot({ sessionId: 42 }, lookupOf("/work/app", "claude"))).toThrow("sessionId is not a session id");
    expect(() => sessionSkillRoot({ sessionId: SESSION }, lookupOf("", "claude"))).toThrow("unknown session");
  });
});

describe("listSkills with a sessionId", () => {
  let home: string;
  let ws: string;
  let repo: string;
  const writeSkill = (root: string, name: string) => {
    mkdirSync(path.join(root, name), { recursive: true });
    writeFileSync(path.join(root, name, "SKILL.md"), "---\ndescription: x\n---\n");
  };
  const writeJson = (file: string, value: unknown) => {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(value));
  };
  const skillsOf = async (params: JsonObject, lookup: SkillSessionLookup) => {
    const handler = createListSkills(ws, { lookup, userDir: path.join(home, ".claude", "skills") });
    return ((await handler(params)) as unknown as { skills: string[] }).skills;
  };

  // Once for the file: the collection host can be configured with only one workspace per process.
  beforeAll(() => {
    home = mkdtempSync(path.join(tmpdir(), "mt-ls-home-"));
    ws = mkdtempSync(path.join(tmpdir(), "mt-ls-ws-"));
    repo = mkdtempSync(path.join(tmpdir(), "mt-ls-repo-"));
    writeSkill(path.join(home, ".claude", "skills"), "mine");
    writeSkill(path.join(ws, ".claude", "skills"), "in-workspace");
    writeSkill(path.join(repo, ".claude", "skills"), "in-repo");
    const install = path.join(home, "installs", "tools");
    writeSkill(path.join(install, "skills"), "deploy");
    writeJson(path.join(home, ".claude", "plugins", "installed_plugins.json"), { plugins: { "tools@m": [{ scope: "user", installPath: install }] } });
    writeJson(path.join(home, ".claude", "settings.json"), { enabledPlugins: { "tools@m": true } });
    initCollectionsBackend({ workspace: ws });
  });
  afterAll(() => {
    [home, ws, repo].forEach((dir) => rmSync(dir, { recursive: true, force: true }));
  });

  it("lists the session's own directory and its plugins, not the workspace", async () => {
    expect(await skillsOf({ sessionId: SESSION }, lookupOf(repo, "claude"))).toEqual(["in-repo", "mine", "tools:deploy"]);
  });

  it("keeps the workspace list, without plugins, when no session is named or it is codex's", async () => {
    const plain = ["in-workspace", "mine"];
    expect(await skillsOf({}, lookupOf(repo, "claude"))).toEqual(plain);
    expect(await skillsOf({ sessionId: SESSION }, lookupOf(repo, "codex"))).toEqual(plain);
  });
});
