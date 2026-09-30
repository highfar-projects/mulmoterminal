import { jsonBody } from "../jsonBody";
import { fetchWithTimeout } from "../utils/fetchWithTimeout";
import { guideLanguageFor, parseReleaseNote, parseReleaseNotes, type ReleaseNoteSummary, type WhatsNewEntry } from "../../common/whatsNew";

// Settings' release notes (#2717): the dated guide of any released version, read without marking
// anything as seen — looking back must not swallow the next What's new dialog.

export async function fetchReleaseNotes(locale: string): Promise<ReleaseNoteSummary[] | null> {
  try {
    const res = await fetchWithTimeout(`/api/whats-new/versions?lang=${guideLanguageFor(locale)}`);
    return res.ok ? (parseReleaseNotes(await jsonBody(res))?.releases ?? null) : null;
  } catch {
    return null;
  }
}

export async function fetchReleaseNote(version: string, locale: string): Promise<WhatsNewEntry | null> {
  try {
    const res = await fetchWithTimeout(`/api/whats-new/version/${encodeURIComponent(version)}?lang=${guideLanguageFor(locale)}`);
    return res.ok ? parseReleaseNote(await jsonBody(res)) : null;
  } catch {
    return null;
  }
}
