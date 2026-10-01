// The Skills viewer over HTTP (#2815). Read-only: the catalog, and one SKILL.md for the preview.
import type { Express } from "express";
import { rememberedSessionCwds } from "../session/registry.js";
import { readSkillCatalog, readSkillDoc, type SkillDocSource } from "../backends/skillCatalog.js";

const nonEmpty = (value: unknown): string | null => (typeof value === "string" && value !== "" ? value : null);

function docSource(query: Record<string, unknown>): SkillDocSource {
  const plugin = nonEmpty(query.plugin);
  if (plugin !== null) return { scope: "plugin", plugin };
  const dir = nonEmpty(query.dir);
  return dir === null ? { scope: "user" } : { scope: "project", dir };
}

export function mountSkillCatalogRoutes(app: Express): void {
  app.get("/api/skills/catalog", async (_req, res) => {
    res.json(await readSkillCatalog({ cwds: await rememberedSessionCwds() }));
  });

  // `plugin` names an enabled plugin, `dir` a directory a terminal ran in; neither means the user dir.
  app.get("/api/skills/doc", async (req, res) => {
    const slug = typeof req.query.slug === "string" ? req.query.slug : "";
    const markdown = await readSkillDoc({ source: docSource(req.query), slug, cwds: await rememberedSessionCwds() });
    if (markdown === null) {
      res.status(404).json({ error: "skill not found" });
      return;
    }
    res.json({ markdown });
  });
}
