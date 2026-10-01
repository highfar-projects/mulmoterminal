// The Skills viewer's catalog rules (#2815): source order, override marking, and the search.
import { describe, it, expect } from "vitest";
import { assembleSkillCatalog, filterSkillCatalog, recentDistinctDirs, type FoundSource } from "../../common/skillCatalog";

const skill = (slug: string, description = `${slug} does things`) => ({ slug, description });
const user: FoundSource = { dir: "/home/u/.claude/skills", skills: [skill("review"), skill("blog")] };

describe("recentDistinctDirs", () => {
  it("lists each directory once, the most recently recorded first", () => {
    expect(recentDistinctDirs(["/a", "/b", "/a", "/c", "/b"])).toEqual(["/b", "/c", "/a"]);
  });

  it("is empty for no history", () => {
    expect(recentDistinctDirs([])).toEqual([]);
  });
});

describe("assembleSkillCatalog", () => {
  it("puts the user skills first, then the projects in the order given, each sorted by slug", () => {
    const catalog = assembleSkillCatalog(user, [
      { dir: "/p2", skills: [skill("zeta"), skill("alpha")] },
      { dir: "/p1", skills: [skill("mid")] },
    ]);
    expect(catalog.sources.map((source) => [source.scope, source.dir, source.skills.map((s) => s.slug)])).toEqual([
      ["user", "/home/u/.claude/skills", ["blog", "review"]],
      ["project", "/p2", ["alpha", "zeta"]],
      ["project", "/p1", ["mid"]],
    ]);
  });

  it("leaves out a directory with no skills, the user dir included", () => {
    const catalog = assembleSkillCatalog({ dir: "/u", skills: [] }, [
      { dir: "/empty", skills: [] },
      { dir: "/p", skills: [skill("x")] },
    ]);
    expect(catalog.sources.map((source) => source.dir)).toEqual(["/p"]);
  });

  it("marks only a PROJECT skill that shares a slug with a user skill", () => {
    const catalog = assembleSkillCatalog(user, [{ dir: "/p", skills: [skill("review"), skill("other")] }]);
    const flags = catalog.sources.flatMap((source) => source.skills.map((s) => `${source.scope}:${s.slug}:${s.overridesUser}`));
    expect(flags).toEqual(["user:blog:false", "user:review:false", "project:other:false", "project:review:true"]);
  });
});

describe("filterSkillCatalog", () => {
  const catalog = assembleSkillCatalog(user, [
    { dir: "/work/mulmoterminal", skills: [skill("deploy", "Ship it to production")] },
    { dir: "/work/other", skills: [skill("lint", "Run the Linter")] },
  ]);
  const slugs = (query: string): string[] => filterSkillCatalog(catalog, query).sources.flatMap((source) => source.skills.map((s) => s.slug));

  it.each(["", "   ", "\t\n"])("returns the catalog unchanged for a blank query %j", (query) => {
    expect(filterSkillCatalog(catalog, query)).toBe(catalog);
  });

  it("matches the slug, the description and the directory, ignoring case", () => {
    expect(slugs("DEPLOY")).toEqual(["deploy"]);
    expect(slugs("linter")).toEqual(["lint"]);
    expect(slugs("mulmoterminal")).toEqual(["deploy"]);
  });

  it("requires every term to match", () => {
    expect(slugs("ship production")).toEqual(["deploy"]);
    expect(slugs("ship linter")).toEqual([]);
  });

  it("drops a source with nothing left and keeps the rest", () => {
    expect(filterSkillCatalog(catalog, "lint").sources.map((source) => source.dir)).toEqual(["/work/other"]);
  });

  it("finds nothing for a term no skill holds", () => {
    expect(filterSkillCatalog(catalog, "nonexistent").sources).toEqual([]);
  });
});
