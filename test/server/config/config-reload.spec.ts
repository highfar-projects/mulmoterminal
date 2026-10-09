// @vitest-environment node
//
// #2627. config.json read again while the server runs: adopted like a save, or refused with the
// running config kept — for a file that does not parse, or a keymap that would stop the start.
import { describe, it, expect, vi, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import express from "express";
import { tmpdir } from "node:os";
import path from "node:path";
import { routeCall, jsonPost } from "../../helpers/routeCall";
import { decideReload } from "../../../server/config/config-reload";
import { emptyConfig } from "../../../server/config/app-config";

const installs = vi.hoisted(() => ({ count: 0 }));
vi.mock("../../../server/infra/fs/install-bundled-skills.js", () => ({
  installBundledSkills: () => {
    installs.count += 1;
  },
}));

describe("decideReload", () => {
  const ok = { status: "ok" as const, config: { ...emptyConfig(), worklogEnabled: true }, unknownKeys: {} };

  it("adopts a readable file, and an absent one as the empty config a start would run on", () => {
    expect(decideReload(ok, [], emptyConfig())).toEqual({ adopt: true, config: ok.config });
    expect(decideReload({ status: "missing" }, [], emptyConfig())).toEqual({ adopt: true, config: emptyConfig() });
  });

  it("refuses a file that cannot be read, and a keymap that would stop the start", () => {
    const corrupt = decideReload({ status: "corrupt", error: "invalid JSON" }, [], emptyConfig());
    expect(corrupt).toMatchObject({ adopt: false, problems: [] });
    const keymap = decideReload(ok, ["  keymap.zoom-next: bad"], emptyConfig());
    expect(keymap).toMatchObject({ adopt: false, problems: ["  keymap.zoom-next: bad"] });
  });
});

const dirs: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  installs.count = 0;
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

async function mountWith(initial: Record<string, unknown>) {
  const dir = mkdtempSync(path.join(tmpdir(), "mt-reload-"));
  dirs.push(dir);
  vi.stubEnv("HOME", dir);
  vi.stubEnv("USERPROFILE", dir);
  mkdirSync(path.join(dir, ".mulmoterminal"), { recursive: true });
  const file = path.join(dir, ".mulmoterminal", "config.json");
  writeFileSync(file, JSON.stringify(initial));
  vi.resetModules();
  const routes = await import("../../../server/config/config-routes.js");
  expect(routes.APP_CONFIG_FILE).toBe(file);
  const systemTasks = vi.fn();
  routes.onSystemTaskSettingsChanged(systemTasks);
  const presets = vi.fn();
  const app = express();
  app.use(express.json());
  routes.mountConfigRoutes(app, dir, presets);
  const call = routeCall(app);
  return { call, edit: (config: unknown) => writeFileSync(file, typeof config === "string" ? config : JSON.stringify(config)), systemTasks, presets, dir };
}

describe("POST /api/config/reload", () => {
  it("adopts a hand-edit, and tells the scheduler and the directory watchers what moved", async () => {
    const { call, edit, systemTasks, presets, dir } = await mountWith({ worklogEnabled: false, showLoadAverage: true });
    edit({ worklogEnabled: true, showLoadAverage: false, cwdPresets: [{ label: "p", path: dir }] });
    const res = await call("/api/config/reload", jsonPost({}));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ worklogEnabled: true, showLoadAverage: false });
    expect((await call("/api/config")).body).toMatchObject({ worklogEnabled: true, showLoadAverage: false });
    expect(systemTasks).toHaveBeenCalledTimes(1);
    expect(presets).toHaveBeenCalledTimes(1);
  });

  it("tells nobody when the file did not move what they depend on", async () => {
    const { call, systemTasks, presets } = await mountWith({ worklogEnabled: true });
    expect((await call("/api/config/reload", jsonPost({}))).status).toBe(200);
    expect(systemTasks).not.toHaveBeenCalled();
    expect(presets).not.toHaveBeenCalled();
    expect(installs.count).toBe(0);
  });

  it("installs the bundled skills when the accounts moved", async () => {
    const { call, edit } = await mountWith({});
    edit({ accounts: [{ id: "work", label: "Work", agent: "claude", home: "~/.claude-work" }] });
    await call("/api/config/reload", jsonPost({}));
    expect(installs.count).toBe(1);
  });

  it("keeps the running config when the file does not parse", async () => {
    const { call, edit } = await mountWith({ worklogEnabled: true });
    edit('{ "worklogEnabled": false, }');
    const res = await call("/api/config/reload", jsonPost({}));
    expect(res.status).toBe(409);
    expect(String(res.body.error)).toContain("nothing was reloaded");
    expect((await call("/api/config")).body).toMatchObject({ worklogEnabled: true });
  });

  it("keeps the running config when the keymap would stop the start, and names the entry", async () => {
    const { call, edit } = await mountWith({ worklogEnabled: true });
    edit({ worklogEnabled: false, keymap: { "zoom-next": "Hyper+PageDown" } });
    const res = await call("/api/config/reload", jsonPost({}));
    expect(res.status).toBe(409);
    expect(JSON.stringify(res.body.problems)).toContain("zoom-next");
    expect((await call("/api/config")).body).toMatchObject({ worklogEnabled: true });
  });
});
