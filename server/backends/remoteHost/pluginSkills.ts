// The skills an ENABLED Claude Code plugin brings, as the ids claude runs them by: `plugin:skill`.
//
// Two records decide it. `enabledPlugins` in claude's settings says which plugins are on, merged per
// key across the user, project and project-local files (the same layers skillOverrides reads).
// `~/.claude/plugins/installed_plugins.json` says where each one is installed: a user-scope install
// applies everywhere, a project or local one only to the directory it was installed for.
// A plugin's skills are the directories under `<installPath>/skills/` that hold a SKILL.md.
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

import { isRecord } from "../../../common/isRecord.js";
import { SLUG_RE } from "../../agents/codex-skills.js";
import { settingsLayers, type HiddenSkillsOptions } from "./skillOverrides.js";

const SKILL_FILE = "SKILL.md";
const INSTALLED_FILE = path.join("plugins", "installed_plugins.json");
const USER_SETTINGS_FILE = "settings.json";

/** The plugin ids (`name@marketplace`) switched on, given the settings layers lowest first. */
export function enabledPluginIds(layers: readonly unknown[]): string[] {
  const effective = new Map<string, boolean>();
  layers.forEach((layer) => {
    if (!isRecord(layer) || !isRecord(layer.enabledPlugins)) return;
    Object.entries(layer.enabledPlugins).forEach(([id, on]) => {
      if (typeof on === "boolean") effective.set(id, on);
    });
  });
  return [...effective].filter(([, on]) => on).map(([id]) => id);
}

export interface PluginInstall {
  /** The name a skill id is prefixed with: `name` of `name@marketplace`. */
  plugin: string;
  installPath: string;
}

// A null root asks for the user-scope installs alone: the ones every directory gets.
const appliesHere = (install: Record<string, unknown>, workspaceRoot: string | null): boolean =>
  install.scope === "user" ||
  (workspaceRoot !== null && typeof install.projectPath === "string" && path.resolve(install.projectPath) === path.resolve(workspaceRoot));

// The narrower install wins when a plugin has more than one for this directory, as the narrower
// settings file does.
const SCOPE_RANK: Record<string, number> = { local: 0, project: 1, user: 2 };
const rankOf = (install: Record<string, unknown>): number =>
  typeof install.scope === "string" ? (SCOPE_RANK[install.scope] ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER;

/** Where each enabled plugin is installed for this directory, from installed_plugins.json's contents. */
export function enabledInstalls(installed: unknown, enabled: readonly string[], workspaceRoot: string | null): PluginInstall[] {
  if (!isRecord(installed) || !isRecord(installed.plugins)) return [];
  const plugins = installed.plugins;
  return enabled.flatMap((id) => {
    const entries = plugins[id];
    if (!Array.isArray(entries)) return [];
    const install = entries
      .filter((entry): entry is Record<string, unknown> => isRecord(entry) && typeof entry.installPath === "string" && appliesHere(entry, workspaceRoot))
      .sort((left, right) => rankOf(left) - rankOf(right))[0];
    return install && typeof install.installPath === "string" ? [{ plugin: id.split("@")[0] ?? id, installPath: install.installPath }] : [];
  });
}

async function readJson(file: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return null;
  }
}

async function isSkillDir(dir: string): Promise<boolean> {
  try {
    return (await stat(path.join(dir, SKILL_FILE))).isFile();
  } catch {
    return false;
  }
}

async function skillIdsOf(install: PluginInstall): Promise<string[]> {
  const skillsDir = path.join(install.installPath, "skills");
  // The same slug rule as a directory's own skills: the id travels to the phone and is typed as `/<id>`.
  const names = (await readdir(skillsDir).catch((): string[] => [])).filter((name) => SLUG_RE.test(name));
  const found = await Promise.all(names.map(async (name) => ((await isSkillDir(path.join(skillsDir, name))) ? `${install.plugin}:${name}` : null)));
  return found.filter((id): id is string => id !== null);
}

/** Every `plugin:skill` id available in `workspaceRoot`. `userSkillsDir` locates `~/.claude`, as in
 *  skillOverrides, so a test that redirects it cannot read the developer's real plugins. */
export async function discoverPluginSkillIds(opts: HiddenSkillsOptions): Promise<string[]> {
  const claudeDir = path.dirname(opts.userSkillsDir);
  const [layers, installed] = await Promise.all([settingsLayers(opts), readJson(path.join(claudeDir, INSTALLED_FILE))]);
  const installs = enabledInstalls(installed, enabledPluginIds(layers), opts.workspaceRoot);
  return (await Promise.all(installs.map(skillIdsOf))).flat();
}

/** The plugins enabled in the user settings and installed for the user — those every directory gets. */
export async function userPluginInstalls(userSkillsDir: string): Promise<PluginInstall[]> {
  const claudeDir = path.dirname(userSkillsDir);
  const [settings, installed] = await Promise.all([readJson(path.join(claudeDir, USER_SETTINGS_FILE)), readJson(path.join(claudeDir, INSTALLED_FILE))]);
  return enabledInstalls(installed, enabledPluginIds([settings]), null);
}
