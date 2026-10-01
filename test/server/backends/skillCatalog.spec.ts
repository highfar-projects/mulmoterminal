// @vitest-environment node
// The Skills viewer's disk side (#2815): which directories are scanned, and which SKILL.md may be read.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
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
    expect(await readSkillDoc({ userDir, cwds: [], dir: null, slug: "review" })).toContain("# review");
  });

  it("reads a project skill from a remembered directory", async () => {
    expect(await readSkillDoc({ userDir, cwds: [projectDir("p")], dir: projectDir("p"), slug: "deploy" })).toContain("description: Ship it");
  });

  it("refuses a directory no terminal ran in", async () => {
    expect(await readSkillDoc({ userDir, cwds: [], dir: projectDir("p"), slug: "deploy" })).toBeNull();
  });

  it("refuses a slug that climbs out of the skills dir, even onto a real SKILL.md", async () => {
    writeFileSync(path.join(projectDir("p"), ".claude", "SKILL.md"), "outside the skills dir");
    writeFileSync(path.join(projectDir("p"), "SKILL.md"), "outside the skills dir");
    for (const slug of ["..", "../.."]) {
      expect(await readSkillDoc({ userDir, cwds: [projectDir("p")], dir: projectDir("p"), slug })).toBeNull();
    }
  });

  it.each(["../p", "..", "", ".hidden", "a/b", "deploy/../../x"])("refuses the slug %j", async (slug) => {
    expect(await readSkillDoc({ userDir, cwds: [projectDir("p")], dir: projectDir("p"), slug })).toBeNull();
  });

  it("answers null for a skill that is not there", async () => {
    expect(await readSkillDoc({ userDir, cwds: [projectDir("p")], dir: projectDir("p"), slug: "absent" })).toBeNull();
  });

  it("refuses a SKILL.md too large to be one", async () => {
    mkdirSync(path.join(userDir, "huge"), { recursive: true });
    writeFileSync(path.join(userDir, "huge", "SKILL.md"), "x".repeat(1024 * 1024 + 1));
    expect(await readSkillDoc({ userDir, cwds: [], dir: null, slug: "huge" })).toBeNull();
  });
});
