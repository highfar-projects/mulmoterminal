// Reading the Skills viewer's catalog and one SKILL.md from the server (#2815). `null` is "could not
// read it", which the overlay shows as a failure rather than as an empty list.
import { isRecord } from "../../common/isRecord";
import { isUnknownArray } from "../../common/isUnknownArray";
import { jsonBody } from "../jsonBody";
import { fetchWithTimeout } from "../utils/fetchWithTimeout";
import type { CatalogSkill, SkillCatalog, SkillSource } from "../../common/skillCatalog";

const isCatalogSkill = (value: unknown): value is CatalogSkill =>
  isRecord(value) &&
  typeof value.slug === "string" &&
  typeof value.id === "string" &&
  typeof value.description === "string" &&
  typeof value.overridesUser === "boolean";

const isSkillSource = (value: unknown): value is SkillSource =>
  isRecord(value) &&
  (value.scope === "user" || value.scope === "plugin" || value.scope === "project") &&
  typeof value.dir === "string" &&
  typeof value.plugin === "string" &&
  isUnknownArray(value.skills) &&
  value.skills.every(isCatalogSkill);

export async function loadSkillCatalog(): Promise<SkillCatalog | null> {
  try {
    const res = await fetchWithTimeout("/api/skills/catalog");
    if (!res.ok) return null;
    const data = await jsonBody(res);
    return isUnknownArray(data.sources) ? { sources: data.sources.filter(isSkillSource) } : null;
  } catch {
    return null;
  }
}

/** The SKILL.md of `slug` in `source`, or null when it could not be read. */
export async function loadSkillDoc(source: SkillSource, slug: string): Promise<string | null> {
  const params = new URLSearchParams({ slug });
  if (source.scope === "plugin") params.set("plugin", source.plugin);
  if (source.scope === "project") params.set("dir", source.dir);
  try {
    const res = await fetchWithTimeout(`/api/skills/doc?${params.toString()}`);
    if (!res.ok) return null;
    const data = await jsonBody(res);
    return typeof data.markdown === "string" ? data.markdown : null;
  } catch {
    return null;
  }
}
