// @vitest-environment node
//
// #2717. Settings reads any released version's guide, newest first, without recording anything as
// seen — looking back must not swallow the next What's new dialog.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { routeCall } from "../../helpers/routeCall";
import { mountWhatsNewRoutes } from "../../../server/whatsNew/routes.js";
import { parseReleaseNote, parseReleaseNotes } from "../../../common/whatsNew";

let guideDir: string;
let claimed: string[];

const page = (title: string) => `---\ntitle: ${title}\n---\n\n# ${title}\n\nBody of ${title} ![shot](../images/x.png)\n`;
const writeGuide = (language: string, version: string, title: string) => {
  mkdirSync(path.join(guideDir, language), { recursive: true });
  writeFileSync(path.join(guideDir, language, `v${version}.md`), page(title));
};

const app = () => {
  const server = express();
  mountWhatsNewRoutes(server, {
    guideDir,
    currentVersion: () => "7.10.0",
    claimSeen: async (version) => {
      claimed.push(version);
      return null;
    },
  });
  return routeCall(server);
};

beforeEach(() => {
  guideDir = mkdtempSync(path.join(os.tmpdir(), "release-notes-"));
  claimed = [];
  writeGuide("en", "7.9.0", "Nine");
  writeGuide("en", "7.10.0", "Ten");
  writeGuide("en", "7.11.0", "Not released yet");
  writeGuide("ja", "7.10.0", "十");
  writeFileSync(path.join(guideDir, "en", "features.md"), page("not a release"));
});

afterEach(() => rmSync(guideDir, { recursive: true, force: true }));

describe("GET /api/whats-new/versions", () => {
  it("lists every release up to the running one, newest by number first, in the reader's language", async () => {
    const res = await app()("/api/whats-new/versions?lang=ja");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      version: "7.10.0",
      releases: [
        { version: "7.10.0", title: "十" },
        { version: "7.9.0", title: "Nine" },
      ],
    });
    expect(claimed).toEqual([]);
  });
});

describe("GET /api/whats-new/version/:version", () => {
  it("answers one release's page with its links made absolute, and records nothing", async () => {
    const res = await app()("/api/whats-new/version/7.9.0?lang=en");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ version: "7.9.0", title: "Nine", url: "https://www.mulmoterminal.com/guide/en/v7.9.0.html" });
    expect(res.body.markdown).toContain("(https://www.mulmoterminal.com/guide/images/x.png)");
    expect(claimed).toEqual([]);
  });

  it("refuses a version not released yet, one with no page, and anything that is not a version", async () => {
    for (const version of ["7.11.0", "1.0.0", "..%2F..%2Fetc", "features"]) {
      expect((await app()(`/api/whats-new/version/${version}`)).status).toBe(404);
    }
  });
});

describe("parseReleaseNotes / parseReleaseNote", () => {
  it("keeps well-formed entries and refuses a body that is not one", () => {
    expect(parseReleaseNotes({ version: "1", releases: [{ version: "1", title: "a" }, { version: 2 }, "x"] })).toEqual({
      version: "1",
      releases: [{ version: "1", title: "a" }],
    });
    expect(parseReleaseNotes({ releases: [] })).toBeNull();
    expect(parseReleaseNote({ version: "1", title: "t", markdown: "m", url: "u" })).toEqual({ version: "1", title: "t", markdown: "m", url: "u" });
    expect(parseReleaseNote({ version: "1" })).toBeNull();
  });
});
