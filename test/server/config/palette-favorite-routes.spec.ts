// @vitest-environment node
// #2546. One palette favorite added or removed against the list ON DISK, never a tab's copy of it.
import { describe, it, expect, vi, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import express from "express";
import { tmpdir } from "node:os";
import path from "node:path";
import { routeCall, jsonPost } from "../../helpers/routeCall";

const dirs: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

async function mountAgainstTempHome(initial: Record<string, unknown>) {
  const dir = mkdtempSync(path.join(tmpdir(), "mt-favorite-routes-"));
  dirs.push(dir);
  vi.stubEnv("HOME", dir);
  vi.stubEnv("USERPROFILE", dir);
  mkdirSync(path.join(dir, ".mulmoterminal"), { recursive: true });
  writeFileSync(path.join(dir, ".mulmoterminal", "config.json"), JSON.stringify(initial, null, 2));
  vi.resetModules();
  const { mountConfigRoutes, APP_CONFIG_FILE } = await import("../../../server/config/config-routes.js");
  expect(APP_CONFIG_FILE.startsWith(dir), "config path must be inside the temp HOME").toBe(true);
  const app = express();
  app.use(express.json());
  mountConfigRoutes(app, dir, vi.fn());
  const onDisk = () => JSON.parse(readFileSync(APP_CONFIG_FILE, "utf8"));
  return { app, onDisk };
}

describe("POST /api/config/palette-favorites", () => {
  it("adds one key at the end and keeps every other, including ones written since this process read the file", async () => {
    const { app, onDisk } = await mountAgainstTempHome({ paletteFavorites: ["screen:wiki"] });
    writeFileSync(path.join(process.env.HOME ?? "", ".mulmoterminal", "config.json"), JSON.stringify({ paletteFavorites: ["screen:wiki", "zoom-toggle"] }));
    const res = await routeCall(app)("/api/config/palette-favorites", jsonPost({ key: "settings:theme", favorite: true }));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ paletteFavorites: ["screen:wiki", "zoom-toggle", "settings:theme"] });
    expect(onDisk().paletteFavorites).toEqual(["screen:wiki", "zoom-toggle", "settings:theme"]);
  });

  it("removes one key and keeps the rest; adding one already there moves nothing twice", async () => {
    const { app, onDisk } = await mountAgainstTempHome({ paletteFavorites: ["a", "b"] });
    await routeCall(app)("/api/config/palette-favorites", jsonPost({ key: "a", favorite: false }));
    expect(onDisk().paletteFavorites).toEqual(["b"]);
    await routeCall(app)("/api/config/palette-favorites", jsonPost({ key: "b", favorite: true }));
    expect(onDisk().paletteFavorites).toEqual(["b"]);
  });

  it("refuses a body without a key or a yes/no, and writes nothing", async () => {
    const { app, onDisk } = await mountAgainstTempHome({ paletteFavorites: ["a"] });
    expect((await routeCall(app)("/api/config/palette-favorites", jsonPost({ key: "", favorite: true }))).status).toBe(400);
    expect((await routeCall(app)("/api/config/palette-favorites", jsonPost({ key: "b", favorite: "yes" }))).status).toBe(400);
    expect(onDisk().paletteFavorites).toEqual(["a"]);
  });

  it("keeps the other settings in the file", async () => {
    const { app, onDisk } = await mountAgainstTempHome({ prRepos: ["o/r"], paletteAliases: { wk: "screen:wiki" } });
    await routeCall(app)("/api/config/palette-favorites", jsonPost({ key: "a", favorite: true }));
    expect(onDisk().prRepos).toEqual(["o/r"]);
    expect(onDisk().paletteAliases).toEqual({ wk: "screen:wiki" });
  });
});
