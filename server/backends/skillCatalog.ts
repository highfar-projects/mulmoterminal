// The Skills viewer's disk side (#2815): scan the user skills dir and every directory a terminal has
// run in, and read one SKILL.md back for the preview.
//
// "What counts as a skill" is `collectSkills`, the rule the header's Skill menu already uses.
import { readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { collectSkills } from "./remoteHost/skills.js";
import { projectSkillsDir, userSkillsDir } from "./collections.js";
import { SLUG_RE } from "../agents/codex-skills.js";
import { assembleSkillCatalog, recentDistinctDirs, type SkillCatalog } from "../../common/skillCatalog.js";

/** A SKILL.md is a page of instructions; anything past this is not one, and is not read whole. */
const MAX_SKILL_DOC_BYTES = 1024 * 1024;
const SKILL_FILE = "SKILL.md";

export interface SkillCatalogOptions {
  /** Directories terminals have run in, oldest first, repeats allowed. */
  cwds: readonly string[];
  /** Override `~/.claude/skills/`, for tests. */
  userDir?: string;
}

/** The project directories worth scanning: each once, newest first, minus one whose skills dir IS
 *  the user dir (a terminal opened in `$HOME`), which would list the user skills a second time. */
function projectDirs(cwds: readonly string[], userDir: string): string[] {
  const userRoot = resolve(userDir);
  return recentDistinctDirs(cwds).filter((dir) => resolve(projectSkillsDir(dir)) !== userRoot);
}

export async function readSkillCatalog(opts: SkillCatalogOptions): Promise<SkillCatalog> {
  const userDir = opts.userDir ?? userSkillsDir();
  const dirs = projectDirs(opts.cwds, userDir);
  const [userSkills, ...projectSkills] = await Promise.all([collectSkills(userDir), ...dirs.map((dir) => collectSkills(projectSkillsDir(dir)))]);
  const projects = dirs.map((dir, index) => ({ dir, skills: projectSkills[index] ?? [] }));
  return assembleSkillCatalog({ dir: userDir, skills: userSkills }, projects);
}

export interface SkillDocRequest extends SkillCatalogOptions {
  /** A remembered project directory, or null for the user skills dir. */
  dir: string | null;
  slug: string;
}

/** The skills root a request may read from, or null when it names a directory no terminal ran in. */
function allowedRoot(request: SkillDocRequest): string | null {
  if (request.dir === null) return request.userDir ?? userSkillsDir();
  return request.cwds.includes(request.dir) ? projectSkillsDir(request.dir) : null;
}

/** The SKILL.md text, or null when the request is not allowed, the file is missing, or too large. */
export async function readSkillDoc(request: SkillDocRequest): Promise<string | null> {
  const root = allowedRoot(request);
  if (root === null || !SLUG_RE.test(request.slug)) return null;
  const file = join(root, request.slug, SKILL_FILE);
  try {
    if ((await stat(file)).size > MAX_SKILL_DOC_BYTES) return null;
    return await readFile(file, "utf-8");
  } catch {
    return null;
  }
}
