// The user's own pictures and videos for playfulEffects (`playfulMedia` in config.json). Both sides
// decide from this file: the server reads the key and serves the files, the browser checks what
// reached it and picks one per session from the same pool as the built-in pictures.
import { isRecord } from "./isRecord.js";
import { HEAT_PATTERNS, hashOf, type HeatPattern, type PlayfulEffects } from "./playfulEffects.js";

export interface PlayfulMediaEntry {
  file: string;
  finale: string | null;
}

export interface PlayfulMedia {
  builtIn: boolean;
  files: PlayfulMediaEntry[];
}

export const PLAYFUL_MEDIA_DEFAULT: PlayfulMedia = { builtIn: true, files: [] };

// Only these forms are read, so a bare `fire.gif` never means "wherever the server happens to be".
// A drive letter is how an absolute path starts on Windows.
const PATH_PREFIXES = ["/", "~/", "./"] as const;
const WINDOWS_ABSOLUTE = /^[A-Za-z]:[\\/]/;
export const isPlayfulMediaPath = (value: unknown): value is string =>
  typeof value === "string" && value.length > 1 && (PATH_PREFIXES.some((prefix) => value.startsWith(prefix)) || WINDOWS_ABSOLUTE.test(value));

function entryOf(input: unknown): PlayfulMediaEntry | null {
  if (isPlayfulMediaPath(input)) return { file: input, finale: null };
  if (!isRecord(input) || !isPlayfulMediaPath(input.file)) return null;
  return { file: input.file, finale: isPlayfulMediaPath(input.finale) ? input.finale : null };
}

/** Entries that are not a path in one of the three forms are dropped; the rest keep their order. */
export function sanitizePlayfulMedia(input: unknown): PlayfulMedia {
  if (!isRecord(input)) return { ...PLAYFUL_MEDIA_DEFAULT, files: [] };
  const files = Array.isArray(input.files) ? input.files.map(entryOf).filter((entry): entry is PlayfulMediaEntry => entry !== null) : [];
  return { builtIn: input.builtIn !== false, files };
}

export type PlayfulMediaKind = "image" | "video";

const MEDIA_BY_EXTENSION: ReadonlyMap<string, { kind: PlayfulMediaKind; mime: string }> = new Map([
  [".gif", { kind: "image", mime: "image/gif" }],
  [".png", { kind: "image", mime: "image/png" }],
  [".apng", { kind: "image", mime: "image/apng" }],
  [".webp", { kind: "image", mime: "image/webp" }],
  [".avif", { kind: "image", mime: "image/avif" }],
  [".svg", { kind: "image", mime: "image/svg+xml" }],
  [".mp4", { kind: "video", mime: "video/mp4" }],
  [".webm", { kind: "video", mime: "video/webm" }],
]);

/** The kind and MIME type for a media path, or null when its extension is not one we play. */
export function playfulMediaType(filePath: string): { kind: PlayfulMediaKind; mime: string } | null {
  const dot = filePath.lastIndexOf(".");
  if (dot < 0) return null;
  return MEDIA_BY_EXTENSION.get(filePath.slice(dot).toLowerCase()) ?? null;
}

export const MEGABYTE = 1024 * 1024;
export const PLAYFUL_MEDIA_MAX_BYTES: Record<PlayfulMediaKind, number> = { image: 20 * MEGABYTE, video: 50 * MEGABYTE };

export const PLAYFUL_MEDIA_ROUTE = "/api/playful-media";

/** One playable file as the browser receives it: a src ready for <img> / <video>, never a path. */
export interface PublicMediaFile {
  kind: PlayfulMediaKind;
  url: string;
}

export interface PublicPlayfulItem {
  media: PublicMediaFile;
  finale: PublicMediaFile | null;
}

export interface PublicPlayfulMedia {
  builtIn: boolean;
  items: PublicPlayfulItem[];
}

const isPlayfulMediaKind = (value: unknown): value is PlayfulMediaKind => value === "image" || value === "video";

function parseMediaFile(raw: unknown): PublicMediaFile | null {
  if (!isRecord(raw) || !isPlayfulMediaKind(raw.kind) || typeof raw.url !== "string" || !raw.url.startsWith(`${PLAYFUL_MEDIA_ROUTE}/`)) return null;
  return { kind: raw.kind, url: raw.url };
}

function parseItem(raw: unknown): PublicPlayfulItem | null {
  if (!isRecord(raw)) return null;
  const media = parseMediaFile(raw.media);
  return media ? { media, finale: parseMediaFile(raw.finale) } : null;
}

/** The client's boundary check on the wire shape: only URLs under our own route reach the DOM. */
export function parsePublicPlayfulMedia(raw: unknown): PublicPlayfulMedia {
  if (!isRecord(raw)) return { builtIn: true, items: [] };
  const items = Array.isArray(raw.items) ? raw.items.map(parseItem).filter((item): item is PublicPlayfulItem => item !== null) : [];
  return { builtIn: raw.builtIn !== false, items };
}

export type HeatPick = { type: "builtIn"; pattern: HeatPattern } | { type: "media"; item: PublicPlayfulItem };

/** What a session shows: one of the built-in pictures, one of the user's files, or nothing.
 *  `stillOnly` (reduced motion) leaves the user's files out, since a browser cannot hold a GIF still.
 *  With no files of the user's, the pick is the one `patternFor` has always made. */
export function heatPickFor(sessionId: string, setting: PlayfulEffects, media: PublicPlayfulMedia, stillOnly: boolean): HeatPick | null {
  if (setting === "off") return null;
  if (setting !== "random") return { type: "builtIn", pattern: setting };
  const builtIns: HeatPick[] = media.builtIn ? HEAT_PATTERNS.map((pattern) => ({ type: "builtIn", pattern })) : [];
  const own: HeatPick[] = stillOnly ? [] : media.items.map((item) => ({ type: "media", item }));
  const pool = [...builtIns, ...own];
  return pool.length === 0 ? null : (pool[hashOf(sessionId) % pool.length] ?? null);
}
