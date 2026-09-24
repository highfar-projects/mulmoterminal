// A directory's terminal background (common/dirBackground.ts): parsed from `.mulmoterminal.json`.
//
// Two spellings. A bare string is the image with the default opacity and fit; an object names
// them. Anything unusable — a missing file, a type the browser cannot draw, an opacity out of
// range — drops the whole key, so the settings preview reports it as ignored rather than drawing
// something other than what was written.
import { isRecord } from "../../common/isRecord.js";
import {
  DIR_BACKGROUND_DEFAULT_FIT,
  DIR_BACKGROUND_DEFAULT_OPACITY,
  isDirBackgroundFit,
  isDirBackgroundOpacity,
  type DirBackgroundFit,
} from "../../common/dirBackground.js";
import { resolveDirIcon, dirIconImage, type DirIcon } from "./dir-icon.js";

export interface DirBackground {
  image: DirIcon;
  opacity: number;
  fit: DirBackgroundFit;
}

// The image is held to the icon's rules — the same confinement to the directory, the same image
// types, the same remote schemes — so a background can never be read from where an icon could not.
const imageOf = (cwd: string, input: unknown): DirIcon | null => (input === false ? null : dirIconImage(resolveDirIcon(cwd, input)));

export function resolveDirBackground(cwd: string, input: unknown): DirBackground | null {
  if (typeof input === "string") {
    const image = imageOf(cwd, input);
    return image ? { image, opacity: DIR_BACKGROUND_DEFAULT_OPACITY, fit: DIR_BACKGROUND_DEFAULT_FIT } : null;
  }
  if (!isRecord(input)) return null;
  const image = imageOf(cwd, input.image);
  const opacity = input.opacity === undefined ? DIR_BACKGROUND_DEFAULT_OPACITY : input.opacity;
  const fit = input.fit === undefined ? DIR_BACKGROUND_DEFAULT_FIT : input.fit;
  if (!image || !isDirBackgroundOpacity(opacity) || !isDirBackgroundFit(fit)) return null;
  return { image, opacity, fit };
}

/** What to write into a worktree's config to mean this background again: the path as the user
 *  typed it (it resolves again in the worktree's own tree) or the remote URL. */
export function dirBackgroundRef(background: DirBackground | null): Record<string, unknown> | null {
  if (!background) return null;
  const image = background.image.source === "file" ? background.image.ref : background.image.url;
  return { image, opacity: background.opacity, fit: background.fit };
}
