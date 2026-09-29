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
let recorded: string[];

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
    readLastSeen: async () => lastSeen,
    recordSeen: async (version) => {
      recorded.push(version);
    },
    ...overrides,
  });
  return app;
};

beforeEach(() => {
  guideDir = mkdtempSync(path.join(os.tmpdir(), "whats-new-"));
  lastSeen = "7.0.0";
  recorded = [];
  writeGuide("en", "7.0.0", "Seven");
  writeGuide("en", "7.0.1", "Seven one");
  writeGuide("en", "7.1.0", "Seven point one");
  writeGuide("ja", "7.1.0", "七・一");
  writeFileSync(path.join(guideDir, "en", "features.md"), page("not a release"));
});

afterEach(() => {
  rmSync(guideDir, { recursive: true, force: true });
});

describe("GET /api/whats-new", () => {
  it("answers the unseen releases in the asked language, falling back to English", async () => {
    const res = await routeCall(appWith())("/api/whats-new?lang=ja");
    expect(res.status).toBe(200);
    expect(res.body.version).toBe("7.1.0");
    expect(res.body.truncated).toBe(false);
    expect(res.body.entries).toEqual([
      expect.objectContaining({ version: "7.1.0", title: "七・一", url: expect.stringContaining("/guide/ja/v7.1.0.html") }),
      expect.objectContaining({ version: "7.0.1", title: "Seven one", url: expect.stringContaining("/guide/en/v7.0.1.html") }),
    ]);
  });

  it("reads English for any other language", async () => {
    const res = await routeCall(appWith())("/api/whats-new?lang=ko");
    expect(res.body.entries).toEqual([expect.objectContaining({ title: "Seven point one" }), expect.objectContaining({ title: "Seven one" })]);
  });

  it("answers no entries when the running version was seen", async () => {
    lastSeen = "7.1.0";
    const res = await routeCall(appWith())("/api/whats-new?lang=en");
    expect(res.body.entries).toEqual([]);
  });

  it("shows nothing on the first run and records the running version", async () => {
    lastSeen = null;
    const res = await routeCall(appWith())("/api/whats-new?lang=ja");
    expect(res.body.entries).toEqual([]);
    expect(recorded).toEqual(["7.1.0"]);
  });

  it("records nothing when a version was already remembered", async () => {
    await routeCall(appWith())("/api/whats-new?lang=ja");
    expect(recorded).toEqual([]);
  });

  it("answers no entries when the guides are not there", async () => {
    const res = await routeCall(appWith({ guideDir: path.join(guideDir, "missing") }))("/api/whats-new");
    expect(res.status).toBe(200);
    expect(res.body.entries).toEqual([]);
  });

  it("reports a state read that fails", async () => {
    const res = await routeCall(
      appWith({
        readLastSeen: async () => {
          throw new Error("disk");
        },
      }),
    )("/api/whats-new");
    expect(res.status).toBe(500);
    expect(String(res.body.error)).toContain("disk");
  });
});

describe("POST /api/whats-new/seen", () => {
  it("records the version the dialog showed", async () => {
    const res = await routeCall(appWith())("/api/whats-new/seen", jsonPost({ version: "7.1.0" }));
    expect(res.status).toBe(200);
    expect(recorded).toEqual(["7.1.0"]);
  });

  it.each([[{}], [{ version: 7 }], [{ version: "latest" }], [{ version: "7.2.0" }], [{ version: "7.1.0-beta" }]])("refuses %j", async (body) => {
    const res = await routeCall(appWith())("/api/whats-new/seen", jsonPost(body));
    expect(res.status).toBe(400);
    expect(recorded).toEqual([]);
  });

  it("reports a write that fails", async () => {
    const res = await routeCall(
      appWith({
        recordSeen: async () => {
          throw new Error("read-only");
        },
      }),
    )("/api/whats-new/seen", jsonPost({ version: "7.1.0" }));
    expect(res.status).toBe(500);
  });
});
