// @vitest-environment node
//
// The saved directories ARE the projects the collection watchers mount for, so a directory added
// mid-session used to wait out a 60s poll before its collections could ring — long enough that a
// new project's first collection reads as broken. The config route now says when the list moved.
//
// Deliberately a callback rather than an import: the config module stays config-shaped, and the
// watchers are the caller's concern (server/routes/app-routes.ts wires them).
import { describe, it, expect, vi, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import express from "express";
import request from "supertest";
import { tmpdir } from "node:os";
import path from "node:path";

const dirs: string[] = [];

afterEach(() => {
  vi.unstubAllEnvs();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** A config route mounted against a throwaway HOME, with the change callback captured. `HOME` and
 *  `USERPROFILE` both, because `os.homedir()` reads the latter on Windows — stubbing one left a
 *  Windows run pointed at the real config. */
async function mountAgainstTempHome(initial: Record<string, unknown>) {
  const dir = mkdtempSync(path.join(tmpdir(), "mt-presets-notify-"));
  dirs.push(dir);
  vi.stubEnv("HOME", dir);
  vi.stubEnv("USERPROFILE", dir);
  vi.resetModules();
  const { mountConfigRoutes, APP_CONFIG_FILE } = await import("../../../server/config/config-routes.js");
  // Guard before anything writes: a stub that did not take would target the real config.
  expect(APP_CONFIG_FILE.startsWith(dir), "config path must be inside the temp HOME").toBe(true);
  mkdirSync(path.dirname(APP_CONFIG_FILE), { recursive: true });
  writeFileSync(APP_CONFIG_FILE, JSON.stringify(initial, null, 2));

  const onChanged = vi.fn();
  const app = express();
  app.use(express.json());
  mountConfigRoutes(app, dir, onChanged);
  return { app, onChanged };
}

const PRESETS = [{ label: "mag2", path: "/srv/mag2" }];

describe("POST /api/config tells the caller when the saved directories move", () => {
  it("fires when a directory is added", async () => {
    const { app, onChanged } = await mountAgainstTempHome({});
    const res = await request(app).post("/api/config").send({ cwdPresets: PRESETS });
    expect(res.status).toBe(200);
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("fires when one is removed", async () => {
    const { app, onChanged } = await mountAgainstTempHome({ cwdPresets: PRESETS });
    await request(app).post("/api/config").send({ cwdPresets: [] });
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  // The write that saves a sound, a theme or a keymap is the common one, and waking the watchers
  // for it would be work with no question behind it.
  it("stays quiet for a write that leaves the list alone", async () => {
    const { app, onChanged } = await mountAgainstTempHome({ cwdPresets: PRESETS });
    await request(app).post("/api/config").send({ pushEnabled: true });
    await request(app).post("/api/config").send({ cwdPresets: PRESETS });
    expect(onChanged).not.toHaveBeenCalled();
  });

  // A relabelled preset is the SAME directory to everything downstream — the watchers and the
  // project ids are keyed by path.
  it("stays quiet when only a label changed", async () => {
    const { app, onChanged } = await mountAgainstTempHome({ cwdPresets: PRESETS });
    await request(app)
      .post("/api/config")
      .send({ cwdPresets: [{ label: "renamed", path: "/srv/mag2" }] });
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("fires when the same count points somewhere else", async () => {
    const { app, onChanged } = await mountAgainstTempHome({ cwdPresets: PRESETS });
    await request(app)
      .post("/api/config")
      .send({ cwdPresets: [{ label: "mag2", path: "/srv/elsewhere" }] });
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  // Mounting without one is what every other caller does; the route must not require it.
  it("does not require a subscriber", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "mt-presets-notify-"));
    dirs.push(dir);
    vi.stubEnv("HOME", dir);
    vi.stubEnv("USERPROFILE", dir);
    vi.resetModules();
    const { mountConfigRoutes } = await import("../../../server/config/config-routes.js");
    const app = express();
    app.use(express.json());
    mountConfigRoutes(app, dir);
    expect((await request(app).post("/api/config").send({ cwdPresets: PRESETS })).status).toBe(200);
  });
});
