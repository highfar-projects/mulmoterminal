// @vitest-environment node
// GET /api/skills?unfiltered=1 (#2728): the directory form chooses the Skill menu's skills from every
// skill the directory can see, which the menu's own list — narrowed by that choice — cannot offer.
import { describe, it, expect, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import express from "express";
import { routeCall } from "../../helpers/routeCall";
import { mountDirRoutes } from "../../../server/routes/dir-routes";

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

function projectWithSkills(slugs: string[], allow: string[]): string {
  const dir = mkdtempSync(path.join(tmpdir(), "mt-skills-"));
  dirs.push(dir);
  slugs.forEach((slug) => {
    mkdirSync(path.join(dir, ".claude", "skills", slug), { recursive: true });
    writeFileSync(path.join(dir, ".claude", "skills", slug, "SKILL.md"), `---\nname: ${slug}\ndescription: the ${slug} skill\n---\n`);
  });
  writeFileSync(path.join(dir, ".mulmoterminal.json"), JSON.stringify({ skills: allow }));
  return dir;
}

const app = express();
mountDirRoutes(app);
const slugsOf = (body: Record<string, unknown>): string[] =>
  (Array.isArray(body.skills) ? body.skills : []).flatMap((skill: unknown) =>
    typeof skill === "object" && skill !== null && "slug" in skill ? [String(skill.slug)] : [],
  );

describe("GET /api/skills", () => {
  it("narrows to the directory's list by default, and lists them all when asked", async () => {
    const dir = projectWithSkills(["alpha-local", "beta-local"], ["beta-local"]);
    const call = routeCall(app);
    const filtered = slugsOf((await call(`/api/skills?cwd=${encodeURIComponent(dir)}`)).body);
    const all = slugsOf((await call(`/api/skills?cwd=${encodeURIComponent(dir)}&unfiltered=1`)).body);
    expect(filtered).toEqual(["beta-local"]);
    expect(all).toEqual(expect.arrayContaining(["alpha-local", "beta-local"]));
  });
});
