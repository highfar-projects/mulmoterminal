// @vitest-environment node
// #2581. Settings' Recommended keys are added to the keymap ON DISK, never a tab's or this process's copy.
import { describe, it, expect, vi, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import express from "express";
import { tmpdir } from "node:os";
import path from "node:path";
import { routeCall, jsonPost } from "../../helpers/routeCall";
import { KEYMAP_PRESETS, presetChanges } from "../../../common/keymapPresets";
import type { Keymap } from "../../../common/keymap";

const dirs: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

async function mountAgainstTempHome(initial: Record<string, unknown>) {
  const dir = mkdtempSync(path.join(tmpdir(), "mt-keymap-preset-"));
  dirs.push(dir);
  vi.stubEnv("HOME", dir);
  vi.stubEnv("USERPROFILE", dir);
  mkdirSync(path.join(dir, ".mulmoterminal"), { recursive: true });
  const file = path.join(dir, ".mulmoterminal", "config.json");
  writeFileSync(file, JSON.stringify(initial, null, 2));
  vi.resetModules();
  const { mountConfigRoutes } = await import("../../../server/config/config-routes.js");
  const app = express();
  app.use(express.json());
  mountConfigRoutes(app, dir, vi.fn());
  const onDisk = () => JSON.parse(readFileSync(file, "utf8"));
  const writeDisk = (config: Record<string, unknown>) => writeFileSync(file, JSON.stringify(config));
  return { app, onDisk, writeDisk };
}
const shown = (keymap: Keymap) => presetChanges(keymap, KEYMAP_PRESETS.other);
const post = (app: express.Express, body: unknown) => routeCall(app)("/api/config/keymap-preset", jsonPost(body));

describe("POST /api/config/keymap-preset", () => {
  it("adds the set to the keymap on disk and answers the saved keymap", async () => {
    const { app, onDisk } = await mountAgainstTempHome({ keymap: { "files-find": "Cmd+Shift+f" } });
    const res = await post(app, { platform: "other", expected: shown({ "files-find": "Cmd+Shift+f" }) });
    expect(res.status).toBe(200);
    expect(onDisk().keymap).toEqual({
      "files-find": "Cmd+Shift+f",
      "zoom-prev": "Alt+ArrowLeft",
      "zoom-next": "Alt+ArrowRight",
      "zoom-toggle": "Alt+ArrowUp",
      "next-attention": "Alt+ArrowDown",
    });
    expect(res.body).toEqual({ keymap: onDisk().keymap });
  });

  // Written to the file after this process read it — by another mulmoterminal, the keys skill, a hand
  // edit — and not something the preset touches: it is kept.
  it("keeps a binding written to the file since this process read it", async () => {
    const { app, onDisk, writeDisk } = await mountAgainstTempHome({ keymap: {} });
    writeDisk({ keymap: { "files-search": "Cmd+Shift+g" } });
    const res = await post(app, { platform: "other", expected: shown({}) });
    expect(res.status).toBe(200);
    expect(onDisk().keymap["files-search"]).toBe("Cmd+Shift+g");
  });

  // An action a newer mulmoterminal added is not one this build lists — and not one it may delete (#2650).
  it("keeps an entry for an action this version does not know", async () => {
    const { app, onDisk } = await mountAgainstTempHome({ keymap: { "some-future-action": "Ctrl+j", "files-find": "F2" } });
    const res = await post(app, { platform: "other", expected: shown({ "files-find": "F2" }) });
    expect(res.status).toBe(200);
    expect(onDisk().keymap).toMatchObject({ "some-future-action": "Ctrl+j", "files-find": "F2", "zoom-toggle": "Alt+ArrowUp" });
    expect(res.body).not.toHaveProperty(["keymap", "some-future-action"]); // the tab gets what this build acts on
  });

  // Written since, and it changes what the list promised: nothing is written, and the file's keymap
  // comes back for the list to be drawn again.
  it("writes nothing when the file makes the list different, and answers the file's keymap", async () => {
    const { app, onDisk, writeDisk } = await mountAgainstTempHome({ keymap: {} });
    writeDisk({ keymap: { "zoom-toggle": "F8" } });
    const res = await post(app, { platform: "other", expected: shown({}) });
    expect(res.status).toBe(409);
    expect(res.body.keymap).toEqual({ "zoom-toggle": "F8" });
    expect(onDisk().keymap).toEqual({ "zoom-toggle": "F8" });
  });

  it.each([[{}], [{ platform: "win" }], [{ platform: 1, expected: [] }]])("refuses %j and writes nothing", async (body) => {
    const { app, onDisk } = await mountAgainstTempHome({ keymap: { "files-find": "F2" } });
    expect((await post(app, body)).status).toBe(400);
    expect(onDisk().keymap).toEqual({ "files-find": "F2" });
  });
});
