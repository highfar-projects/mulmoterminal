// @vitest-environment node
//
// #2619. One shortcut set or cleared from Settings, on the keymap ON DISK — so a binding the keys
// skill, another tab or a hand-edit wrote since the page loaded survives — and refused when it would
// stop the server from starting.
import { describe, it, expect, vi, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import express from "express";
import { tmpdir } from "node:os";
import path from "node:path";
import { routeCall, jsonPost } from "../../helpers/routeCall";
import { keymapWithBinding } from "../../../server/config/keymap-binding-route";

const dirs: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

async function mountWith(initial: Record<string, unknown>) {
  const dir = mkdtempSync(path.join(tmpdir(), "mt-keybind-"));
  dirs.push(dir);
  vi.stubEnv("HOME", dir);
  vi.stubEnv("USERPROFILE", dir);
  mkdirSync(path.join(dir, ".mulmoterminal"), { recursive: true });
  const file = path.join(dir, ".mulmoterminal", "config.json");
  writeFileSync(file, JSON.stringify(initial));
  vi.resetModules();
  const routes = await import("../../../server/config/config-routes.js");
  expect(routes.APP_CONFIG_FILE).toBe(file);
  const app = express();
  app.use(express.json());
  routes.mountConfigRoutes(app, dir);
  return {
    set: (action: unknown, binding: unknown) => routeCall(app)("/api/config/keymap/binding", jsonPost({ action, binding })),
    onDisk: () => JSON.parse(readFileSync(file, "utf8")),
    writeOnDisk: (config: unknown) => writeFileSync(file, JSON.stringify(config)),
  };
}

describe("keymapWithBinding", () => {
  it("sets, replaces and clears one action, leaving the others", () => {
    const keymap = { "zoom-next": "PageDown", "zoom-prev": "PageUp" };
    expect(keymapWithBinding(keymap, "zoom-next", "Shift+PageDown")).toEqual({ "zoom-next": "Shift+PageDown", "zoom-prev": "PageUp" });
    expect(keymapWithBinding(keymap, "zoom-next", null)).toEqual({ "zoom-prev": "PageUp" });
    expect(keymapWithBinding(keymap, "focus-mode", "Ctrl+Shift+f")).toEqual({ ...keymap, "focus-mode": "Ctrl+Shift+f" });
  });
});

describe("POST /api/config/keymap/binding", () => {
  it("sets one binding against the keymap on disk, keeping one written there since boot", async () => {
    const { set, onDisk, writeOnDisk } = await mountWith({ keymap: { "zoom-prev": "PageUp" } });
    writeOnDisk({ keymap: { "zoom-prev": "PageUp", "focus-mode": "Ctrl+Shift+f" } });
    const res = await set("zoom-next", "PageDown");
    expect(res.status).toBe(200);
    expect(onDisk().keymap).toEqual({ "zoom-prev": "PageUp", "focus-mode": "Ctrl+Shift+f", "zoom-next": "PageDown" });
    expect(res.body.keymap).toEqual(onDisk().keymap);
  });

  it("clears one binding", async () => {
    const { set, onDisk } = await mountWith({ keymap: { "zoom-next": "PageDown", "zoom-prev": "PageUp" } });
    await set("zoom-next", null);
    expect(onDisk().keymap).toEqual({ "zoom-prev": "PageUp" });
  });

  it("refuses a binding that would stop the start, writing nothing", async () => {
    const { set, onDisk } = await mountWith({ keymap: { "zoom-prev": "PageUp" } });
    const res = await set("zoom-next", "Hyper+PageDown");
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("fatal");
    expect(Array.isArray(res.body.problems) && res.body.problems.length).toBeGreaterThan(0);
    expect(onDisk().keymap).toEqual({ "zoom-prev": "PageUp" });
  });

  it("saves a binding the browser keeps, and says so", async () => {
    const { set, onDisk } = await mountWith({});
    const res = await set("terminal-close", "Cmd+W");
    expect(res.status).toBe(200);
    expect(onDisk().keymap).toEqual({ "terminal-close": "Cmd+W" });
    expect(Array.isArray(res.body.warnings) && res.body.warnings.length).toBeGreaterThan(0);
  });

  it("refuses an action it does not know, and a binding that is not a string or null", async () => {
    const { set } = await mountWith({});
    expect((await set("no-such-action", "PageDown")).status).toBe(400);
    expect((await set("zoom-next", 42)).status).toBe(400);
    expect((await set("zoom-next", "  ")).status).toBe(400);
  });
});
