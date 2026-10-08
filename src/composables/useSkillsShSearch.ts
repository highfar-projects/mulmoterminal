// The Skills viewer's skills.sh side (#2835), through this server — the browser never talks to
// skills.sh itself. `null` is "could not read it", shown as a failure rather than as no results.
import { isRecord } from "../../common/isRecord";
import { isUnknownArray } from "../../common/isUnknownArray";
import { jsonBody } from "../jsonBody";
import { fetchWithTimeout } from "../utils/fetchWithTimeout";
import type { RemoteSkill, RemoteSkillDoc, RemoteSkillFile } from "../../common/skillsSh";

const isRemoteSkill = (value: unknown): value is RemoteSkill =>
  isRecord(value) &&
  typeof value.source === "string" &&
  typeof value.skillId === "string" &&
  typeof value.name === "string" &&
  typeof value.installs === "number";

const isRemoteSkillFile = (value: unknown): value is RemoteSkillFile => isRecord(value) && typeof value.path === "string" && typeof value.bytes === "number";

async function getJson(url: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetchWithTimeout(url);
    return res.ok ? await jsonBody(res) : null;
  } catch {
    return null;
  }
}

export async function searchRemoteSkills(query: string): Promise<RemoteSkill[] | null> {
  const data = await getJson(`/api/skills/remote/search?${new URLSearchParams({ q: query }).toString()}`);
  return data && isUnknownArray(data.skills) ? data.skills.filter(isRemoteSkill) : null;
}

export async function loadRemoteSkill(skill: Pick<RemoteSkill, "source" | "skillId">): Promise<RemoteSkillDoc | null> {
  const data = await getJson(`/api/skills/remote/skill?${new URLSearchParams({ source: skill.source, skill: skill.skillId }).toString()}`);
  if (!data || typeof data.markdown !== "string" || !isUnknownArray(data.files)) return null;
  return { markdown: data.markdown, files: data.files.filter(isRemoteSkillFile) };
}
