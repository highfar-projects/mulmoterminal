// Searching skills.sh from the Skills viewer (#2835): the shapes the server hands the overlay, and the
// rules both sides decide from. Read-only — nothing here installs a skill; the overlay offers the
// `npx skills add` line for the user to run themselves.

/** One search hit. `source` is the GitHub `owner/repo`, `skillId` the skill's directory name there. */
export interface RemoteSkill {
  source: string;
  skillId: string;
  name: string;
  installs: number;
}

export interface RemoteSkillFile {
  path: string;
  bytes: number;
}

/** A skill as skills.sh serves it: its SKILL.md, and every file it would bring with it. */
export interface RemoteSkillDoc {
  markdown: string;
  files: RemoteSkillFile[];
}

// GitHub's own character set for owner and repository names, and the skill-directory names skills.sh
// serves. Anything else is refused before it is put into a URL.
const OWNER_REPO_RE = /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/;
const SKILL_ID_RE = /^[A-Za-z0-9._-]+$/;

export const isRemoteSource = (value: string): boolean => OWNER_REPO_RE.test(value) && !value.split("/").some((part) => part === "." || part === "..");
export const isRemoteSkillId = (value: string): boolean => SKILL_ID_RE.test(value) && value !== "." && value !== "..";

/** The line that installs it with the official CLI, for the user to run — the viewer never runs it. */
export const installCommand = (skill: Pick<RemoteSkill, "source" | "skillId">): string => `npx skills add ${skill.source} --skill ${skill.skillId}`;

export const skillsShPageUrl = (skill: Pick<RemoteSkill, "source" | "skillId">): string => `https://skills.sh/${skill.source}/${skill.skillId}`;

// A skill is instructions the agent follows with the user's permissions; files that RUN are the part
// worth pointing out before anyone installs it.
const EXECUTABLE_EXTENSIONS = new Set(["sh", "bash", "zsh", "py", "js", "mjs", "cjs", "ts", "rb", "pl", "php", "ps1", "bat", "cmd", "exe"]);

export function isExecutableFile(path: string): boolean {
  const name = path.split("/").pop() ?? "";
  const dot = name.lastIndexOf(".");
  return dot > 0 && EXECUTABLE_EXTENSIONS.has(name.slice(dot + 1).toLowerCase());
}

/** Whether a skill of this name is already on disk, so the hit can say so. Matched by name, the way
 *  claude resolves `/name` — the same name from another repository still counts. */
export const isInstalledLocally = (skill: Pick<RemoteSkill, "skillId">, localSlugs: ReadonlySet<string>): boolean => localSlugs.has(skill.skillId);
