// The Skills viewer over HTTP (#2815). Read-only: the catalog, and one SKILL.md for the preview.
import type { Express } from "express";
import { rememberedSessionCwds } from "../session/registry.js";
import { readSkillCatalog, readSkillDoc } from "../backends/skillCatalog.js";

export function mountSkillCatalogRoutes(app: Express): void {
  app.get("/api/skills/catalog", async (_req, res) => {
    res.json(await readSkillCatalog({ cwds: await rememberedSessionCwds() }));
  });

  // `dir` absent means the user skills dir. Any other value must be a directory a terminal ran in.
  app.get("/api/skills/doc", async (req, res) => {
    const dir = typeof req.query.dir === "string" && req.query.dir !== "" ? req.query.dir : null;
    const slug = typeof req.query.slug === "string" ? req.query.slug : "";
    const markdown = await readSkillDoc({ dir, slug, cwds: await rememberedSessionCwds() });
    if (markdown === null) {
      res.status(404).json({ error: "skill not found" });
      return;
    }
    res.json({ markdown });
  });
}
