// The launch panel's directories as command-palette rows (#2484): the workspace, then the recent
// directories, each opening a new terminal there. Pure.
import { launchChips, type CwdPreset } from "../components/presets";
import { homeRelative } from "../components/cwdDisplay";
import { isLaunchAgent, type LaunchAgent } from "../../common/launchAgent";

export interface PaletteLaunchDir {
  path: string;
  /** How it reads: the workspace's name, or the path relative to home. */
  label: string;
}

export function paletteLaunchDirs(presets: readonly CwdPreset[], defaultCwd: string | null, home: string | null): PaletteLaunchDir[] {
  return launchChips(presets, defaultCwd).map((chip) => ({ path: chip.path, label: chip.isWorkspace ? chip.label : homeRelative(chip.path, home) }));
}

/** What a palette start runs: the default agent, or Claude when the default is a custom agent,
 *  which `openTerminalAt` cannot start. */
export const paletteLaunchAgent = (configured: string): LaunchAgent => (isLaunchAgent(configured) ? configured : "claude");
