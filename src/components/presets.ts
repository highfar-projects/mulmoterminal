import { worktreeLabel } from "./cwdDisplay";
import { isSameDirPath } from "../../common/dirPathKey";

// A directory preset offered as a one-click chip in the cell launch form.
// The list is auto-populated from the dirs the user launches in (see
// useAppConfig.recordPreset) and pruned with the chip's close button.
export interface CwdPreset {
  label: string;
  path: string;
}

// Chip label for an auto-recorded dir: a managed worktree shows
// "repo (task)"; any other path shows its trailing segment (basename).
export function presetLabel(path: string): string {
  const wt = worktreeLabel(path);
  if (wt) return `${wt.repo} (${wt.task})`;
  const segments = path.split(/[/\\]/).filter(Boolean);
  return segments[segments.length - 1] ?? path;
}

/** A chip as the launcher renders it: a preset, plus whether it is THE workspace. */
export interface LaunchChip extends CwdPreset {
  isWorkspace: boolean;
}

/**
 * The chips to render: the workspace FIRST and always, then the recent directories.
 *
 * The workspace is not an ordinary recent dir, and the launcher used to treat it as one — it
 * appeared only if you had happened to launch there and had not since removed it, because the list
 * is auto-recorded by `recordPreset`. But it is the one directory where every GUI tool is reachable
 * (see `carriesFullGuiMcp` on the server), so being unable to get to it from the launcher is
 * exactly backwards. It is synthesised here rather than written into the user's saved presets:
 * nothing about it needs storing, and a stored copy would go stale the moment CLAUDE_CWD changed.
 *
 * Pinned ahead of the priority ordering on purpose. `orderByDirPriority` ranks the directories a
 * user configured against each other; the workspace is not competing in that ranking.
 *
 * Its existing label is kept when it IS among the presets, so a directory the user has colour-coded
 * and named does not get renamed by having become the workspace. Matched with `isSameDirPath`, the
 * same lexical comparison the worktree rows use: the browser cannot resolve a symlink, so this
 * folds only the spellings a person types (a trailing slash, a `..`). Getting it wrong shows the
 * directory twice — the server still decides what the workspace really is, with a realpath.
 */
export function launchChips(orderedPresets: readonly CwdPreset[], defaultCwd: string | null | undefined): LaunchChip[] {
  const rest = orderedPresets.filter((p) => !defaultCwd || !isSameDirPath(p.path, defaultCwd)).map((p) => ({ ...p, isWorkspace: false }));
  if (!defaultCwd) return rest;
  const existing = orderedPresets.find((p) => isSameDirPath(p.path, defaultCwd));
  return [{ label: existing?.label ?? presetLabel(defaultCwd), path: defaultCwd, isWorkspace: true }, ...rest];
}
