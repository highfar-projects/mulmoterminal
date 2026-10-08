// Whether a claude cell is started with Claude Code's fullscreen renderer turned off (#2808). Pure.
//
// The fullscreen renderer draws on the alternate screen, which has no scrollback: the cell loses its
// scrollbar and a selection cannot grow past one screen. Claude Code turns it on by itself when
// `tui` is unset (a fresh install, or a server-side rollout), so a cell changed under a user who
// never asked. `CLAUDE_CODE_NO_FLICKER=0` turns it off — but it also beats an explicit
// `"tui": "fullscreen"`, so it is passed only when nobody has decided: no `tui` in any settings
// file Claude reads, and neither switch already in the environment.
import { isRecord } from "../../../../common/isRecord.js";

/** The variables that already decide the renderer; either one present means the user chose. */
export const RENDERER_ENV_VARS = ["CLAUDE_CODE_NO_FLICKER", "CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN"] as const;

/** What a settings file says about `tui`: true when it names a renderer at the top level. A file that
 *  is absent or does not parse decides nothing — Claude cannot read it either. */
export function settingsChooseRenderer(settingsText: string | null): boolean {
  if (settingsText === null) return false;
  try {
    const settings: unknown = JSON.parse(settingsText);
    return isRecord(settings) && typeof settings.tui === "string";
  } catch {
    return false;
  }
}

/** The env to add to the spawn: the opt-out when nothing chose a renderer, else nothing. */
export function rendererOptOutEnv(settingsTexts: readonly (string | null)[], env: Readonly<Record<string, string | undefined>>): Record<string, string> {
  if (RENDERER_ENV_VARS.some((name) => env[name] !== undefined)) return {};
  if (settingsTexts.some(settingsChooseRenderer)) return {};
  return { CLAUDE_CODE_NO_FLICKER: "0" };
}

/** The settings files Claude Code reads for a session in `cwd` whose user config lives in `home`. */
export const claudeSettingsFiles = (home: string, cwd: string, join: (...parts: string[]) => string): string[] => [
  join(home, "settings.json"),
  join(cwd, ".claude", "settings.json"),
  join(cwd, ".claude", "settings.local.json"),
];
