// GET /api/whats-new — the dated guides for the versions this user has not been shown yet.
// POST /api/whats-new/seen — the dialog was closed on `version`.
//
// Decided here rather than in the browser because the remembered version is per machine, not per
// tab or per browser: two browsers on one server must not each announce the same release.
import type { Express } from "express";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { compareVersions, guideLanguageFor, versionsToShow, type GuideLanguage, type WhatsNewEntry } from "../../common/whatsNew.js";
import { getUpdateStatus } from "../config/update-status.js";
import { requestBody } from "../routes/requestBody.js";
import { toWhatsNewEntry } from "./guidePage.js";
import { readLastSeenVersion, recordSeenVersion } from "./state.js";

const GUIDE_FILE = /^v(\d+\.\d+\.\d+)\.md$/;
const RELEASE_VERSION = /^\d+\.\d+\.\d+$/;
const DEFAULT_GUIDE_DIR = path.join(import.meta.dirname, "..", "..", "docs", "guide");

export interface WhatsNewDeps {
  guideDir: string;
  currentVersion: () => string;
  readLastSeen: () => Promise<string | null>;
  recordSeen: (version: string) => Promise<void>;
}

const defaultDeps: WhatsNewDeps = {
  guideDir: DEFAULT_GUIDE_DIR,
  currentVersion: () => getUpdateStatus().version,
  readLastSeen: readLastSeenVersion,
  recordSeen: recordSeenVersion,
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
  app.get("/api/whats-new", async (req, res) => {
    const language = guideLanguageFor(typeof req.query.lang === "string" ? req.query.lang : "");
    const current = deps.currentVersion();
    try {
      const lastSeen = await deps.readLastSeen();
      // The first run that remembers anything shows nothing and starts the record, so the NEXT
      // upgrade has a version to count from.
      if (lastSeen === null) await deps.recordSeen(current);
      const { versions, truncated } = versionsToShow(await releasedVersions(deps.guideDir), lastSeen, current);
      const entries = (await Promise.all(versions.map((version) => readEntry(deps.guideDir, language, version)))).flat();
      res.json({ version: current, entries, truncated });
    } catch (err) {
      res.status(500).json({ error: `could not read the release guides in ${deps.guideDir}: ${err instanceof Error ? err.message : String(err)}` });
    }
  });

  app.post("/api/whats-new/seen", async (req, res) => {
    const { version } = requestBody(req.body);
    if (typeof version !== "string" || !RELEASE_VERSION.test(version) || compareVersions(version, deps.currentVersion()) > 0) {
      res.status(400).json({ error: "version must be a released version no newer than the running one" });
      return;
    }
    try {
      await deps.recordSeen(version);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: `could not record the seen version: ${err instanceof Error ? err.message : String(err)}` });
    }
  });
}
