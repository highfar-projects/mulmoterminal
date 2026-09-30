// What POST /api/whats-new answers, and the rules both sides decide it by: which versions a user who
// last saw `lastSeen` has not been told about, and which guide language a UI locale reads.

import { isRecord } from "./isRecord.js";

export type GuideLanguage = "en" | "ja";

export interface WhatsNewEntry {
  version: string;
  title: string;
  markdown: string;
  /** The same page on the published guide site, for reading it outside the dialog. */
  url: string;
}

export interface WhatsNewResponse {
  /** The running version, recorded as seen by the request that answered this. */
  version: string;
  /** Newest first. Empty when there is nothing new to show. */
  entries: WhatsNewEntry[];
  /** True when older versions were left out; the dialog then points at the full changelog. */
  truncated: boolean;
}

// The docs site's own domain (docs/CNAME). receptron.github.io/mulmoterminal redirects here, and an
// image trusted by origin must be named by the host that finally serves it.
export const GUIDE_SITE_ORIGIN = "https://www.mulmoterminal.com";
// The changelog has no front matter, so the docs site does not publish it; GitHub renders it.
export const CHANGELOG_URL = "https://github.com/receptron/mulmoterminal/blob/main/docs/ChangeLog.md";

// Someone coming back after dozens of releases is better served by the changelog than by a dialog
// they have to scroll for minutes.
export const MAX_WHATS_NEW_VERSIONS = 10;

const versionParts = (version: string): number[] => (version.split("-")[0] ?? "").split(".").map((part) => Number.parseInt(part, 10) || 0);

/** Numeric major.minor.patch order (so 4.10.0 sorts after 4.9.0); pre-release suffixes ignored. */
export function compareVersions(left: string, right: string): number {
  const leftParts = versionParts(left);
  const rightParts = versionParts(right);
  const firstDifferent = [0, 1, 2].find((index) => (leftParts[index] ?? 0) !== (rightParts[index] ?? 0));
  return firstDifferent === undefined ? 0 : (leftParts[firstDifferent] ?? 0) - (rightParts[firstDifferent] ?? 0);
}

/** The versions to tell the user about, newest first.
 *
 *  With no `lastSeen` nothing is shown: there is no telling which version they came from, and a
 *  fresh install has nothing to be told about. */
export function versionsToShow(available: readonly string[], lastSeen: string | null, current: string): { versions: string[]; truncated: boolean } {
  if (lastSeen === null) return { versions: [], truncated: false };
  const unseen = available
    .filter((version) => compareVersions(version, current) <= 0 && compareVersions(version, lastSeen) > 0)
    .sort((first, second) => -compareVersions(first, second));
  return { versions: unseen.slice(0, MAX_WHATS_NEW_VERSIONS), truncated: unseen.length > MAX_WHATS_NEW_VERSIONS };
}

/** Only Japanese has its own guide; every other UI language reads the English one. */
export const guideLanguageFor = (locale: string): GuideLanguage => (locale === "ja" ? "ja" : "en");

const parseEntry = (value: unknown): WhatsNewEntry[] => {
  if (!isRecord(value)) return [];
  const { version, title, markdown, url } = value;
  if (typeof version !== "string" || typeof title !== "string" || typeof markdown !== "string" || typeof url !== "string") return [];
  return [{ version, title, markdown, url }];
};

/** The response, or null when the body is not one — a dialog must not open on a guess. */
export function parseWhatsNew(body: unknown): WhatsNewResponse | null {
  if (!isRecord(body) || typeof body.version !== "string" || !Array.isArray(body.entries)) return null;
  return { version: body.version, entries: body.entries.flatMap(parseEntry), truncated: body.truncated === true };
}
