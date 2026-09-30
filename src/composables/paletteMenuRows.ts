// The acting terminal's Run-menu scripts and Skill-menu skills as command-palette rows (#2697).
// Pure: the lists and the words are parameters.
import type { HighlightPart } from "../components/filePathMatch";
import type { DiscoveredSkill, RunnableScript } from "./useDirLists";
import type { PaletteRow } from "./commandPaletteRows";

interface MenuRowCommon {
  label: HighlightPart[];
  description: string;
  disabledReason: string | null;
  icon: string;
}

/** A script.json entry, run in a new command cell as the Run menu runs it. */
export interface ScriptRow extends MenuRowCommon {
  kind: "script";
  script: RunnableScript;
}

/** A skill, submitted into the acting terminal's session as the Skill menu submits it. */
export interface SkillRow extends MenuRowCommon {
  kind: "skill";
  slug: string;
}

export type MenuCandidate = { kind: "script"; script: RunnableScript; name: string } | { kind: "skill"; skill: DiscoveredSkill; name: string };

export interface MenuText {
  runScript: (label: string) => string;
  runSkill: (slug: string) => string;
}

// The menus' own icons, so a row reads as the item it came from.
const SCRIPT_ICON = "play_arrow";
const SKILL_ICON = "bolt";

/** Each entry with its search text: a script's command is searched too, and its index keeps two
 *  alike entries apart. */
export function menuCandidates(scripts: readonly RunnableScript[], skills: readonly DiscoveredSkill[], text: MenuText): [string, MenuCandidate][] {
  const scriptRuns = scripts.map((script): [string, MenuCandidate] => {
    const name = text.runScript(script.label);
    return [`${name} ${script.command} #${script.index}`, { kind: "script", script, name }];
  });
  const skillRuns = skills.map((skill): [string, MenuCandidate] => {
    const name = text.runSkill(skill.slug);
    return [`${name} #${skill.slug}`, { kind: "skill", skill, name }];
  });
  return [...scriptRuns, ...skillRuns];
}

export function menuRow(candidate: MenuCandidate, label: HighlightPart[]): ScriptRow | SkillRow {
  if (candidate.kind === "script") {
    const { script } = candidate;
    return { kind: "script", script, icon: SCRIPT_ICON, label, description: script.command, disabledReason: null };
  }
  const { skill } = candidate;
  return { kind: "skill", slug: skill.slug, icon: SKILL_ICON, label, description: skill.description, disabledReason: null };
}

export const isMenuRow = (row: PaletteRow): row is ScriptRow | SkillRow => row.kind === "script" || row.kind === "skill";

export const menuRowKey = (row: ScriptRow | SkillRow): string => (row.kind === "script" ? `script:${row.script.index}` : `skill:${row.slug}`);
