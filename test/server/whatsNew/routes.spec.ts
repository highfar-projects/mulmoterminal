// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { routeCall, jsonPost } from "../../helpers/routeCall";
import { mountWhatsNewRoutes, type WhatsNewDeps } from "../../../server/whatsNew/routes.js";

let guideDir: string;
let lastSeen: string | null;
let claimed: string[];

const page = (title: string) => `---\ntitle: ${title}\n---\n\n# ${title}\n\nBody of ${title}\n`;

const writeGuide = (language: string, version: string, title: string) => {
  mkdirSync(path.join(guideDir, language), { recursive: true });
  writeFileSync(path.join(guideDir, language, `v${version}.md`), page(title));
};

const appWith = (overrides: Partial<WhatsNewDeps> = {}) => {
  const app = express();
  app.use(express.json());
  mountWhatsNewRoutes(app, {
    guideDir,
    currentVersion: () => "7.1.0",
    claimSeen: async (version) => {
      claimed.push(version);
      return lastSeen;
    },
    ...overrides,
  });
  return app;
};

beforeEach(() => {
  guideDir = mkdtempSync(path.join(os.tmpdir(), "whats-new-"));
  lastSeen = "7.0.0";
  claimed = [];
  writeGuide("en", "7.0.0", "Seven");
  writeGuide("en", "7.0.1", "Seven one");
  writeGuide("en", "7.1.0", "Seven point one");
  writeGuide("ja", "7.1.0", "七・一");
  writeFileSync(path.join(guideDir, "en", "features.md"), page("not a release"));
});

afterEach(() => {
  rmSync(guideDir, { recursive: true, force: true });
});

describe("POST /api/whats-new", () => {
  it("answers the unseen releases in the asked language, falling back to English", async () => {
    const res = await routeCall(appWith())("/api/whats-new", jsonPost({ lang: "ja" }));
    expect(res.status).toBe(200);
    expect(res.body.version).toBe("7.1.0");
    expect(res.body.truncated).toBe(false);
    expect(res.body.entries).toEqual([
      expect.objectContaining({ version: "7.1.0", title: "七・一", url: expect.stringContaining("/guide/ja/v7.1.0.html") }),
      expect.objectContaining({ version: "7.0.1", title: "Seven one", url: expect.stringContaining("/guide/en/v7.0.1.html") }),
    ]);
  });

  it("reads English for any other language", async () => {
    const res = await routeCall(appWith())("/api/whats-new", jsonPost({ lang: "ko" }));
    expect(res.body.entries).toEqual([expect.objectContaining({ title: "Seven point one" }), expect.objectContaining({ title: "Seven one" })]);
  });

  it("answers no entries when the running version was seen", async () => {
    lastSeen = "7.1.0";
    const res = await routeCall(appWith())("/api/whats-new", jsonPost({ lang: "en" }));
    expect(res.body.entries).toEqual([]);
  });

  it("claims the running version on every answer", async () => {
    await routeCall(appWith())("/api/whats-new", jsonPost({ lang: "ja" }));
    expect(claimed).toEqual(["7.1.0"]);
  });

  it("shows nothing on the first run", async () => {
    lastSeen = null;
    const res = await routeCall(appWith())("/api/whats-new", jsonPost({ lang: "ja" }));
    expect(res.body.entries).toEqual([]);
    expect(claimed).toEqual(["7.1.0"]);
  });

  it("reads English when no language is sent", async () => {
    const res = await routeCall(appWith())("/api/whats-new", jsonPost({ lang: 7 }));
    expect(res.body.entries).toEqual([expect.objectContaining({ title: "Seven point one" }), expect.objectContaining({ title: "Seven one" })]);
  });

  it("does not answer a GET", async () => {
    const res = await routeCall(appWith())("/api/whats-new");
    expect(res.status).toBe(404);
    expect(claimed).toEqual([]);
  });

  it("answers no entries when the guides are not there", async () => {
    const res = await routeCall(appWith({ guideDir: path.join(guideDir, "missing") }))("/api/whats-new", jsonPost({}));
    expect(res.status).toBe(200);
    expect(res.body.entries).toEqual([]);
  });

  it("reports a state claim that fails", async () => {
    const res = await routeCall(
      appWith({
        claimSeen: async () => {
          throw new Error("disk");
        },
      }),
    )("/api/whats-new", jsonPost({ lang: "en" }));
    expect(res.status).toBe(500);
    expect(String(res.body.error)).toContain("disk");
  });
});
