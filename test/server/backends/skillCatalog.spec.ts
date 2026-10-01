// @vitest-environment node
// The Skills viewer's disk side (#2815): which directories are scanned, and which SKILL.md may be read.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { readSkillCatalog, readSkillDoc } from "../../../server/backends/skillCatalog.js";

let root: string;
let userDir: string;

function writeSkill(skillsDir: string, slug: string, description = `${slug} skill`): void {
  mkdirSync(path.join(skillsDir, slug), { recursive: true });
  writeFileSync(path.join(skillsDir, slug, "SKILL.md"), `---\nname: ${slug}\ndescription: ${description}\n---\n\n# ${slug}\n`);
}

const projectDir = (name: string): string => path.join(root, name);

/** A plugin installed for the user, its skills under `<install>/skills`, switched on or off. */
function installPlugin(id: string, enabled: boolean, scope = "user"): string {
  const installPath = path.join(root, "plugin-cache", id);
  const claudeDir = path.dirname(userDir);
  const installedFile = path.join(claudeDir, "plugins", "installed_plugins.json");
  const settingsFile = path.join(claudeDir, "settings.json");
  const read = (file: string): Record<string, Record<string, unknown>> => (existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {});
  const installed = read(installedFile);
  mkdirSync(path.dirname(installedFile), { recursive: true });
  writeFileSync(installedFile, JSON.stringify({ version: 2, plugins: { ...installed.plugins, [id]: [{ scope, installPath, projectPath: root }] } }));
  const settings = read(settingsFile);
  writeFileSync(settingsFile, JSON.stringify({ enabledPlugins: { ...settings.enabledPlugins, [id]: enabled } }));
  return path.join(installPath, "skills");
}
const projectSkills = (name: string): string => path.join(projectDir(name), ".claude", "skills");

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "mt-skill-catalog-"));
  userDir = path.join(root, "home", ".claude", "skills");
  writeSkill(userDir, "review");
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("readSkillCatalog", () => {
  it("lists the user skills and each remembered project with skills, newest first", async () => {
    writeSkill(projectSkills("old"), "alpha");
    writeSkill(projectSkills("new"), "review");
    mkdirSync(projectDir("bare"), { recursive: true });
    const catalog = await readSkillCatalog({ userDir, cwds: [projectDir("old"), projectDir("bare"), projectDir("new"), projectDir("missing")] });
    expect(catalog.sources.map((source) => [source.scope, source.dir, source.skills.map((s) => `${s.slug}:${s.overridesUser}`)])).toEqual([
      ["user", userDir, ["review:false"]],
      ["project", projectDir("new"), ["review:true"]],
      ["project", projectDir("old"), ["alpha:false"]],
    ]);
  });

  it("does not list the user skills twice when a terminal ran in the home directory", async () => {
    const catalog = await readSkillCatalog({ userDir, cwds: [path.join(root, "home"), `${path.join(root, "home")}/`] });
    expect(catalog.sources.map((source) => source.scope)).toEqual(["user"]);
  });

  it("lists the skills of each ENABLED user plugin, under the plugin's name", async () => {
    writeSkill(installPlugin("tne@tne-plugins", true), "ceo17-stress-test-idea");
    writeSkill(installPlugin("off@market", false), "hidden");
    writeSkill(installPlugin("proj@market", true, "project"), "project-scoped");
    const catalog = await readSkillCatalog({ userDir, cwds: [] });
    expect(catalog.sources.map((source) => [source.scope, source.plugin, source.skills.map((s) => s.id)])).toEqual([
      ["user", "", ["review"]],
      ["plugin", "tne", ["tne:ceo17-stress-test-idea"]],
    ]);
  });

  it("skips a directory that holds no valid skill", async () => {
    mkdirSync(path.join(projectSkills("p"), "no-frontmatter"), { recursive: true });
    writeFileSync(path.join(projectSkills("p"), "no-frontmatter", "SKILL.md"), "# just a heading\n");
    const catalog = await readSkillCatalog({ userDir, cwds: [projectDir("p")] });
    expect(catalog.sources.map((source) => source.scope)).toEqual(["user"]);
  });
});

describe("readSkillDoc", () => {
  beforeEach(() => writeSkill(projectSkills("p"), "deploy", "Ship it"));

  it("reads a user skill when no directory is given", async () => {
    expect(await readSkillDoc({ userDir, cwds: [], source: { scope: "user" }, slug: "review" })).toContain("# review");
  });

  it("reads a project skill from a remembered directory", async () => {
    expect(await readSkillDoc({ userDir, cwds: [projectDir("p")], source: { scope: "project", dir: projectDir("p") }, slug: "deploy" })).toContain(
      "description: Ship it",
    );
  });

  it("refuses a directory no terminal ran in", async () => {
    expect(await readSkillDoc({ userDir, cwds: [], source: { scope: "project", dir: projectDir("p") }, slug: "deploy" })).toBeNull();
  });

  it("refuses a slug that climbs out of the skills dir, even onto a real SKILL.md", async () => {
    writeFileSync(path.join(projectDir("p"), ".claude", "SKILL.md"), "outside the skills dir");
    writeFileSync(path.join(projectDir("p"), "SKILL.md"), "outside the skills dir");
    for (const slug of ["..", "../.."]) {
      expect(await readSkillDoc({ userDir, cwds: [projectDir("p")], source: { scope: "project", dir: projectDir("p") }, slug })).toBeNull();
    }
  });

  it.each(["../p", "..", "", ".hidden", "a/b", "deploy/../../x"])("refuses the slug %j", async (slug) => {
    expect(await readSkillDoc({ userDir, cwds: [projectDir("p")], source: { scope: "project", dir: projectDir("p") }, slug })).toBeNull();
  });

  it("reads a skill of an enabled plugin, and refuses one of a plugin that is off", async () => {
    writeSkill(installPlugin("tne@tne-plugins", true), "ceo17");
    writeSkill(installPlugin("off@market", false), "hidden");
    expect(await readSkillDoc({ userDir, cwds: [], source: { scope: "plugin", plugin: "tne" }, slug: "ceo17" })).toContain("# ceo17");
    expect(await readSkillDoc({ userDir, cwds: [], source: { scope: "plugin", plugin: "off" }, slug: "hidden" })).toBeNull();
    expect(await readSkillDoc({ userDir, cwds: [], source: { scope: "plugin", plugin: "absent" }, slug: "ceo17" })).toBeNull();
  });

  it("answers null for a skill that is not there", async () => {
    expect(await readSkillDoc({ userDir, cwds: [projectDir("p")], source: { scope: "project", dir: projectDir("p") }, slug: "absent" })).toBeNull();
  });

  it("refuses a SKILL.md too large to be one", async () => {
    mkdirSync(path.join(userDir, "huge"), { recursive: true });
    writeFileSync(path.join(userDir, "huge", "SKILL.md"), "x".repeat(1024 * 1024 + 1));
    expect(await readSkillDoc({ userDir, cwds: [], source: { scope: "user" }, slug: "huge" })).toBeNull();
  });
});
