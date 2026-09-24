// A directory's terminal background: a picture shown faintly behind its terminals, the way Eterm
// did. BOTH sides decide from this file — the server reads the config key and serves the file,
// the browser checks what reached it before putting it in an <img>.
//
// The image follows the directory icon's rules (common/dirIcon.ts): a file inside the project,
// streamed by this server, or an http(s) / data: URL the browser loads itself.
import { isRecord } from "./isRecord.js";
import { isRemoteDirIconUrl } from "./dirIcon.js";

export const DIR_BACKGROUND_FITS = ["cover", "contain"] as const;
export type DirBackgroundFit = (typeof DIR_BACKGROUND_FITS)[number];
export const isDirBackgroundFit = (value: unknown): value is DirBackgroundFit => DIR_BACKGROUND_FITS.some((fit) => fit === value);

/** Faint enough that a photo reads as a backdrop rather than as the content. */
export const DIR_BACKGROUND_DEFAULT_OPACITY = 0.15;
export const DIR_BACKGROUND_DEFAULT_FIT: DirBackgroundFit = "cover";

/** Above 0 (0 is "no background", which omitting the key already says) and at most 1. */
export const isDirBackgroundOpacity = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 1;

export const DIR_BACKGROUND_ROUTE = "/api/dir-background";

/** What the browser receives: a src ready for an <img>, never a file path. */
export interface PublicDirBackground {
  url: string;
  opacity: number;
  fit: DirBackgroundFit;
}

const isUsableBackgroundSrc = (raw: unknown): raw is string =>
  typeof raw === "string" && !!raw && (raw.startsWith(`${DIR_BACKGROUND_ROUTE}?`) || isRemoteDirIconUrl(raw));

/** The client's own boundary check on the wire shape, so a widened response cannot put an
 *  unexpected scheme into the DOM. Null for anything that is not a usable background. */
export function parsePublicDirBackground(raw: unknown): PublicDirBackground | null {
  if (!isRecord(raw) || !isUsableBackgroundSrc(raw.url) || !isDirBackgroundOpacity(raw.opacity) || !isDirBackgroundFit(raw.fit)) return null;
  return { url: raw.url, opacity: raw.opacity, fit: raw.fit };
}
