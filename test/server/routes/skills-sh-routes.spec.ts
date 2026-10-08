// @vitest-environment node
// The skills.sh half of the Skills viewer's routes (#2835), with skills.sh replaced by a fake.
import { describe, it, expect, vi } from "vitest";
import express from "express";
import { routeCall } from "../../helpers/routeCall";
import { mountSkillCatalogRoutes } from "../../../server/routes/skill-catalog-routes";
import type { FetchText } from "../../../server/backends/skills/skillsSh";

function setup(fetchSkillsSh: FetchText) {
  const app = express();
  mountSkillCatalogRoutes(app, { fetchSkillsSh });
  return routeCall(app);
}

const SEARCH = { skills: [{ id: "anthropics/skills/pdf", source: "anthropics/skills", skillId: "pdf", name: "pdf", installs: 9 }] };
const SNAPSHOT = { files: [{ path: "SKILL.md", contents: "# pdf" }] };

describe("GET /api/skills/remote/search", () => {
  it("answers the hits", async () => {
    const res = await setup(async () => JSON.stringify(SEARCH))("/api/skills/remote/search?q=pdf");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ skills: [{ source: "anthropics/skills", skillId: "pdf", name: "pdf", installs: 9 }] });
  });

  it.each([
    ["no query", "/api/skills/remote/search"],
    ["a blank query", "/api/skills/remote/search?q=%20%20"],
    ["a query past the bound", `/api/skills/remote/search?q=${"a".repeat(201)}`],
  ])("answers 400 for %s and asks skills.sh nothing", async (_label, url) => {
    const fetchSkillsSh = vi.fn(async () => JSON.stringify(SEARCH));
    expect((await setup(fetchSkillsSh)(url)).status).toBe(400);
    expect(fetchSkillsSh).not.toHaveBeenCalled();
  });

  it("answers 502 when skills.sh could not be read", async () => {
    expect((await setup(async () => null)("/api/skills/remote/search?q=pdf")).status).toBe(502);
  });
});

describe("GET /api/skills/remote/skill", () => {
  it("answers the SKILL.md and the file list", async () => {
    const res = await setup(async () => JSON.stringify(SNAPSHOT))("/api/skills/remote/skill?source=anthropics/skills&skill=pdf");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ markdown: "# pdf", files: [{ path: "SKILL.md", bytes: 5 }] });
  });

  it.each([
    ["no source", "/api/skills/remote/skill?skill=pdf"],
    ["a source that climbs", "/api/skills/remote/skill?source=a/..&skill=pdf"],
    ["a skill with a slash", "/api/skills/remote/skill?source=a/b&skill=x/y"],
  ])("answers 400 for %s and asks skills.sh nothing", async (_label, url) => {
    const fetchSkillsSh = vi.fn(async () => JSON.stringify(SNAPSHOT));
    expect((await setup(fetchSkillsSh)(url)).status).toBe(400);
    expect(fetchSkillsSh).not.toHaveBeenCalled();
  });

  it("answers 502 when the skill could not be read", async () => {
    expect((await setup(async () => null)("/api/skills/remote/skill?source=a/b&skill=x")).status).toBe(502);
  });
});
