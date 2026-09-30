// @vitest-environment node
//
// #2626. A save that moves a setting the system tasks are built from tells the scheduler; any other
// save does not, because a rebuild re-runs the catch-up plan and Settings POSTs on every click.
import { describe, it, expect, vi, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import express from "express";
import { tmpdir } from "node:os";
import path from "node:path";
import { routeCall, jsonPost } from "../../helpers/routeCall";

const dirs: string[] = [];

afterEach(() => {
  vi.unstubAllEnvs();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

async function mountWith(initial: Record<string, unknown>) {
  const dir = mkdtempSync(path.join(tmpdir(), "mt-systask-"));
  dirs.push(dir);
  vi.stubEnv("HOME", dir);
  vi.stubEnv("USERPROFILE", dir);
  mkdirSync(path.join(dir, ".mulmoterminal"), { recursive: true });
  writeFileSync(path.join(dir, ".mulmoterminal", "config.json"), JSON.stringify(initial));
  vi.resetModules();
  const routes = await import("../../../server/config/config-routes.js");
  expect(routes.APP_CONFIG_FILE.startsWith(dir), "config path must be inside the temp HOME").toBe(true);
  const listener = vi.fn();
  routes.onSystemTaskSettingsChanged(listener);
  const app = express();
  app.use(express.json());
  routes.mountConfigRoutes(app, dir);
  return { app, listener, routes };
}

const post = (app: express.Express, body: Record<string, unknown>) => routeCall(app)("/api/config", jsonPost(body));

describe("POST /api/config and the system tasks", () => {
  it("tells the scheduler when a switch moves, and the getters already answer the new value", async () => {
    const { app, listener, routes } = await mountWith({ worklogEnabled: false });
    const seen: unknown[] = [];
    listener.mockImplementation(() => seen.push(routes.getWorklogConfig()));
    const res = await post(app, { worklogEnabled: true });
    expect(res.status).toBe(200);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(seen).toEqual([{ enabled: true, intervalHours: expect.any(Number) }]);
  });

  it("says nothing for a save that moves none of them, including re-saving the same value", async () => {
    const { app, listener } = await mountWith({ feedRefreshEnabled: true });
    expect((await post(app, { showLoadAverage: false })).status).toBe(200);
    expect((await post(app, { feedRefreshEnabled: true })).status).toBe(200);
    expect(listener).not.toHaveBeenCalled();
  });

  it("still answers 200 when the listener throws", async () => {
    const { app, listener } = await mountWith({ calendarSyncEnabled: true });
    listener.mockImplementation(() => {
      throw new Error("scheduler gone");
    });
    const res = await post(app, { calendarSyncEnabled: false });
    expect(res.status).toBe(200);
  });
});

// #2626: the idle-session sweep's cadence is re-armed on a save that moves it, and only then.
describe("POST /api/config and the sweep cadence", () => {
  it("passes the new cadence on when a save moves it, and says nothing otherwise", async () => {
    const { app, routes } = await mountWith({ sessionReapIntervalHours: 0 });
    const cadences: number[] = [];
    routes.onSessionReapIntervalChanged((hours) => cadences.push(hours));
    expect((await post(app, { sessionReapIntervalHours: 6 })).status).toBe(200);
    expect((await post(app, { sessionReapIntervalHours: 6 })).status).toBe(200);
    expect((await post(app, { showLoadAverage: false })).status).toBe(200);
    expect(cadences).toEqual([6]);
  });
});
