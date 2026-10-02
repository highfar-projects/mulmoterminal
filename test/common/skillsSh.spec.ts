import { describe, it, expect } from "vitest";
import { installCommand, isExecutableFile, isInstalledLocally, isRemoteSkillId, isRemoteSource, skillsShPageUrl } from "../../common/skillsSh";

describe("isRemoteSource", () => {
  it.each(["anthropics/skills", "vercel-labs/agent-skills", "a/b.c_d-e", "A1/R2"])("accepts %s", (source) => {
    expect(isRemoteSource(source)).toBe(true);
  });

  it.each(["", "anthropics", "a/b/c", "a/..", "../b", "a/.", "a b/c", "a/b?x=1", "a/b#x", "a%2fb/c", "/a/b", "a/b/", "a_b/c"])("refuses %j", (source) => {
    expect(isRemoteSource(source)).toBe(false);
  });
});

describe("isRemoteSkillId", () => {
  it.each(["pdf", "vercel-react-best-practices", "a.b_c"])("accepts %s", (id) => {
    expect(isRemoteSkillId(id)).toBe(true);
  });

  it.each(["", ".", "..", "a/b", "a b", "a?b", "a%2F"])("refuses %j", (id) => {
    expect(isRemoteSkillId(id)).toBe(false);
  });
});

describe("the install line and the page", () => {
  const skill = { source: "anthropics/skills", skillId: "pdf" };

  it("is the official CLI's add command for that one skill", () => {
    expect(installCommand(skill)).toBe("npx skills add anthropics/skills --skill pdf");
  });

  it("is the skill's page on skills.sh", () => {
    expect(skillsShPageUrl(skill)).toBe("https://skills.sh/anthropics/skills/pdf");
  });
});

describe("isExecutableFile", () => {
  it.each(["scripts/run.sh", "x.py", "a/b/c.JS", "tool.ts", "setup.ps1", "x.mjs"])("flags %s", (path) => {
    expect(isExecutableFile(path)).toBe(true);
  });

  it.each(["SKILL.md", "reference.md", "LICENSE.txt", "data.json", "Makefile", ".sh", "scripts/README", "image.png"])("does not flag %s", (path) => {
    expect(isExecutableFile(path)).toBe(false);
  });
});

describe("isInstalledLocally", () => {
  it("matches by skill name, whatever the repository", () => {
    expect(isInstalledLocally({ skillId: "pdf" }, new Set(["pdf"]))).toBe(true);
    expect(isInstalledLocally({ skillId: "pdf" }, new Set(["docx"]))).toBe(false);
    expect(isInstalledLocally({ skillId: "pdf" }, new Set())).toBe(false);
  });
});
