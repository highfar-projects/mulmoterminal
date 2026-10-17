// Which of the user's `playfulMedia` files can actually be played, and where each one is. The
// decisions are pure over an injected `stat`; only `statMediaFile` and `warnPlayfulMediaOnce`
// touch the outside world.
import { statSync } from "node:fs";
import path from "node:path";
import {
  MEGABYTE,
  PLAYFUL_MEDIA_MAX_BYTES,
  PLAYFUL_MEDIA_ROUTE,
  isPlayfulMediaPath,
  playfulMediaType,
  type PlayfulMedia,
  type PlayfulMediaKind,
  type PublicMediaFile,
  type PublicPlayfulMedia,
} from "../../common/playfulMedia.js";
import { isRecord } from "../../common/isRecord.js";

export interface MediaDirs {
  home: string;
  launchDir: string;
}

export interface MediaStat {
  isFile: boolean;
  size: number;
  mtimeMs: number;
}

export type StatOf = (absolutePath: string) => MediaStat | null;

export interface PlayableFile {
  path: string;
  kind: PlayfulMediaKind;
  mime: string;
  version: number;
}

export interface PlayableItem {
  media: PlayableFile;
  finale: PlayableFile | null;
}

/** `~/` is the home directory, `./` the directory MulmoTerminal was started in, `/` itself. */
export function resolveMediaPath(raw: string, dirs: MediaDirs): string {
  if (raw.startsWith("~/")) return path.join(dirs.home, raw.slice("~/".length));
  if (raw.startsWith("./")) return path.resolve(dirs.launchDir, raw);
  return path.resolve(raw);
}

type FileCheck = { file: PlayableFile } | { problem: string };

export function checkMediaFile(raw: string, dirs: MediaDirs, statOf: StatOf): FileCheck {
  const absolute = resolveMediaPath(raw, dirs);
  const type = playfulMediaType(absolute);
  if (type === null) return { problem: "is not a GIF, APNG, WebP, PNG, AVIF, SVG, MP4 or WebM file" };
  const stat = statOf(absolute);
  if (stat === null) return { problem: "does not exist" };
  if (!stat.isFile) return { problem: "is not a file" };
  const limit = PLAYFUL_MEDIA_MAX_BYTES[type.kind];
  if (stat.size > limit) return { problem: `is larger than ${limit / MEGABYTE} MB` };
  return { file: { path: absolute, kind: type.kind, mime: type.mime, version: Math.trunc(stat.mtimeMs) } };
}

export interface MediaCatalog {
  items: PlayableItem[];
  warnings: string[];
}

const warningFor = (raw: string, problem: string, role: string): string => `[playfulMedia] ${role} "${raw}" ${problem}, so it is not used.`;

/** The playable entries, in config order, and one warning for every file that was left out.
 *  A finale that cannot be played leaves its entry in, without a finale. */
export function mediaCatalog(media: PlayfulMedia, dirs: MediaDirs, statOf: StatOf): MediaCatalog {
  const warnings: string[] = [];
  const items = media.files.flatMap((entry): PlayableItem[] => {
    const main = checkMediaFile(entry.file, dirs, statOf);
    if ("problem" in main) {
      warnings.push(warningFor(entry.file, main.problem, "file"));
      return [];
    }
    if (entry.finale === null) return [{ media: main.file, finale: null }];
    const finale = checkMediaFile(entry.finale, dirs, statOf);
    if ("problem" in finale) warnings.push(warningFor(entry.finale, finale.problem, "finale"));
    return [{ media: main.file, finale: "file" in finale ? finale.file : null }];
  });
  return { items, warnings };
}

const publicFile = (file: PlayableFile, url: string): PublicMediaFile => ({ kind: file.kind, url: `${url}?v=${file.version}` });

/** What the browser receives: the files by index under our own route, never a path. */
export function publicPlayfulMedia(media: PlayfulMedia, items: PlayableItem[]): PublicPlayfulMedia {
  return {
    builtIn: media.builtIn,
    items: items.map((item, index) => {
      const url = `${PLAYFUL_MEDIA_ROUTE}/${index}`;
      return { media: publicFile(item.media, url), finale: item.finale ? publicFile(item.finale, `${url}/finale`) : null };
    }),
  };
}

/** The entries `sanitizePlayfulMedia` drops for their shape, each worth a line in the log: a path
 *  that is not `/`, `~/` or `./` reads as a typo nobody would otherwise notice. */
export function droppedPathWarnings(raw: unknown): string[] {
  if (!isRecord(raw) || !Array.isArray(raw.files)) return [];
  return raw.files.flatMap((entry): string[] => {
    const file: unknown = isRecord(entry) ? entry.file : entry;
    const finale: unknown = isRecord(entry) ? entry.finale : undefined;
    const bad = [file, finale].filter((value) => value !== undefined && value !== null && !isPlayfulMediaPath(value));
    return bad.map(
      (value) => `[playfulMedia] ${JSON.stringify(value)} does not start with "/", "~/" or "./" (or a drive letter on Windows), so it is not used.`,
    );
  });
}

export function statMediaFile(absolutePath: string): MediaStat | null {
  try {
    const stat = statSync(absolutePath);
    return { isFile: stat.isFile(), size: stat.size, mtimeMs: stat.mtimeMs };
  } catch {
    return null;
  }
}

// Once per distinct line: the list is re-read on every request for it, and a missing file would
// otherwise repeat in the log each time a browser loads its config.
const warned = new Set<string>();
export function warnPlayfulMediaOnce(lines: string[]): void {
  lines
    .filter((line) => !warned.has(line))
    .forEach((line) => {
      warned.add(line);
      console.warn(line);
    });
}
