// POST /api/whats-new — the dated guides for the versions this user has not been shown yet.
//
// Answering IS showing: the running version is recorded as seen in the same step, so of several
// tabs or browsers opening after an upgrade only the first gets the guides. Decided here rather
// than in the browser because the record is per machine, not per tab. A POST because it writes
// that record, and only state-changing methods pass the same-origin guard.
import type { Express } from "express";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { guideLanguageFor, versionsToShow, type GuideLanguage, type WhatsNewEntry } from "../../common/whatsNew.js";
import { getUpdateStatus } from "../config/update-status.js";
import { requestBody } from "../routes/requestBody.js";
import { toWhatsNewEntry } from "./guidePage.js";
import { claimSeenVersion } from "./state.js";

const GUIDE_FILE = /^v(\d+\.\d+\.\d+)\.md$/;
const DEFAULT_GUIDE_DIR = path.join(import.meta.dirname, "..", "..", "docs", "guide");

export interface WhatsNewDeps {
  guideDir: string;
  currentVersion: () => string;
  /** Records `version` as seen and answers what was recorded before; see claimSeenVersion. */
  claimSeen: (version: string) => Promise<string | null>;
}

const defaultDeps: WhatsNewDeps = {
  guideDir: DEFAULT_GUIDE_DIR,
  currentVersion: () => getUpdateStatus().version,
  claimSeen: claimSeenVersion,
};

// The English directory is the list of releases: every release writes both pages, and English is
// the fallback when a Japanese one is missing.
async function releasedVersions(guideDir: string): Promise<string[]> {
  const names = await readdir(path.join(guideDir, "en")).catch(() => []);
  return names.flatMap((name) => GUIDE_FILE.exec(name)?.slice(1, 2) ?? []);
}

async function readEntry(guideDir: string, language: GuideLanguage, version: string): Promise<WhatsNewEntry[]> {
  const pagePath = (lang: GuideLanguage) => path.join(guideDir, lang, `v${version}.md`);
  const localized = await readFile(pagePath(language), "utf-8").catch(() => null);
  if (localized !== null) return [toWhatsNewEntry(localized, language, version)];
  const english = await readFile(pagePath("en"), "utf-8").catch(() => null);
  return english === null ? [] : [toWhatsNewEntry(english, "en", version)];
}

export function mountWhatsNewRoutes(app: Express, deps: WhatsNewDeps = defaultDeps): void {
  app.post("/api/whats-new", async (req, res) => {
    const { lang } = requestBody(req.body);
    const language = guideLanguageFor(typeof lang === "string" ? lang : "");
    const current = deps.currentVersion();
    try {
      // With nothing recorded before (a fresh install, or the first run with this feature) the
      // claim starts the record and versionsToShow answers nothing.
      const lastSeen = await deps.claimSeen(current);
      const { versions, truncated } = versionsToShow(await releasedVersions(deps.guideDir), lastSeen, current);
      const entries = (await Promise.all(versions.map((version) => readEntry(deps.guideDir, language, version)))).flat();
      res.json({ version: current, entries, truncated });
    } catch (err) {
      res.status(500).json({ error: `could not read the release guides in ${deps.guideDir}: ${err instanceof Error ? err.message : String(err)}` });
    }
  });
}
