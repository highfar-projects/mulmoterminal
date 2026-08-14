// Which skills claude will REFUSE to run, read from `skillOverrides` in its settings.
//
// A skill set to `"off"` is hidden from claude's own `/` menu and, since 2.1.199, from the command
// lists it advertises to Remote Control and Agent SDK clients — and invoking one by name returns
// the skillOverrides error instead of running it. Our Skill menu types that name into the cell, so
// listing an `"off"` skill offers a button that cannot work (#1698).
//
// Only `"off"` hides. `"name-only"` and `"user-invocable-only"` change what claude is TOLD about a
// skill, not whether a person can run it, so both stay in the menu.
//
// Plugin skills are deliberately not a concern here: claude states they are unaffected by
// skillOverrides (`/plugin` manages those), and this repo does not discover them at all.
import { readFile } from "node:fs/promises";
import path from "node:path";

import { isRecord } from "../../../common/isRecord.js";

/** The one state that makes a skill unrunnable. */
const HIDDEN_STATE = "off";

const SETTINGS_FILE = "settings.json";
const LOCAL_SETTINGS_FILE = "settings.local.json";

/** The `skillOverrides` map of one settings file, or an empty one for anything that isn't a map of
 *  strings — a hand-edited file may hold anything, and a malformed entry must not hide a skill. */
function overridesOf(settings: unknown): Record<string, string> {
  if (!isRecord(settings) || !isRecord(settings.skillOverrides)) return {};
  const entries = Object.entries(settings.skillOverrides).filter((entry): entry is [string, string] => typeof entry[1] === "string");
  return Object.fromEntries(entries);
}

/** The slugs claude would refuse, given each scope's parsed settings **in precedence order,
 *  lowest first**. Merged per key rather than per file: claude's scopes override one setting at a
 *  time, so a project file naming one skill does not discard the user file's other entries. */
export function hiddenSkillsFromSettings(layers: readonly unknown[]): Set<string> {
  const effective = new Map<string, string>();
  layers.forEach((layer) => Object.entries(overridesOf(layer)).forEach(([slug, state]) => effective.set(slug, state)));
  return new Set([...effective].filter(([, state]) => state === HIDDEN_STATE).map(([slug]) => slug));
}

/** A settings file's contents, or null when it is absent or not JSON. Absent is the ordinary
 *  case — most machines have no project settings at all. */
async function readSettings(file: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return null;
  }
}

export interface HiddenSkillsOptions {
  /** Project scope: `<workspaceRoot>/.claude/settings{,.local}.json`. */
  workspaceRoot: string;
  /** `~/.claude/skills`, or a test's stand-in. The user settings file is its SIBLING — claude
   *  keeps both under `~/.claude` — so deriving it here means a test that already redirects the
   *  skills root cannot accidentally read the developer's real settings. */
  userSkillsDir: string;
}

/**
 * The slugs to leave out of the Skill menu. Read from the three scopes a user can write, lowest
 * precedence first: user, then project, then project-local (which is where claude's own `/skills`
 * menu writes).
 *
 * Enterprise MANAGED settings are NOT read. On macOS and Windows they are an MDM preferences
 * domain rather than a file, so reading the Linux file alone would answer differently per platform
 * for the same policy. The gap shows only where a managed policy turns a skill back ON that the
 * user turned off — the rarer half of a rare setting — and it fails toward listing a skill, which
 * is what this whole module is narrowing.
 */
export async function hiddenSkills(opts: HiddenSkillsOptions): Promise<Set<string>> {
  const projectDir = path.join(opts.workspaceRoot, ".claude");
  const files = [path.join(path.dirname(opts.userSkillsDir), SETTINGS_FILE), path.join(projectDir, SETTINGS_FILE), path.join(projectDir, LOCAL_SETTINGS_FILE)];
  return hiddenSkillsFromSettings(await Promise.all(files.map(readSettings)));
}
