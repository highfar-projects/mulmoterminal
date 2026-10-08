// @vitest-environment node
//
// #2623. Custom themes copied, recoloured and removed one theme at a time against the file.
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

async function mountWith(initial: Record<string, unknown>) {
  const dir = mkdtempSync(path.join(tmpdir(), "mt-themes-"));
  dirs.push(dir);
  vi.stubEnv("HOME", dir);
  vi.stubEnv("USERPROFILE", dir);
  mkdirSync(path.join(dir, ".mulmoterminal"), { recursive: true });
  const file = path.join(dir, ".mulmoterminal", "config.json");
  writeFileSync(file, JSON.stringify(initial));
  vi.resetModules();
  const routes = await import("../../../server/config/config-routes.js");
  expect(routes.APP_CONFIG_FILE, "config path must be inside the temp HOME").toBe(file);
  const app = express();
  app.use(express.json());
  routes.mountConfigRoutes(app, dir);
  const onDisk = () => JSON.parse(readFileSync(file, "utf8"));
  const writeOnDisk = (config: Record<string, unknown>) => writeFileSync(file, JSON.stringify(config));
  return { post: (route: string, body: unknown) => routeCall(app)(route, jsonPost(body)), onDisk, writeOnDisk };
}

const mine = { id: "mine", label: "Mine", extends: "nord", colors: { "--accent": "#ff0000" } };

describe("custom themes, one at a time", () => {
  it("copies a built-in into the list ON DISK, keeping a theme written there since boot, and names the copy", async () => {
    const { post, onDisk, writeOnDisk } = await mountWith({});
    writeOnDisk({ themes: [mine], prRepos: ["acme/app"] });
    const res = await post("/api/config/themes/duplicate", { source: "nord", label: "Nord copy" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: "nord-copy" });
    expect(onDisk().themes).toEqual([mine, { id: "nord-copy", label: "Nord copy", extends: "nord", colors: {} }]);
    expect(onDisk().prRepos).toEqual(["acme/app"]);
  });

  it("recolours one theme and leaves the rest of it alone", async () => {
    const { post, onDisk } = await mountWith({ themes: [{ ...mine, term: { cursor: "#00ff00" } }] });
    const res = await post("/api/config/themes/colors", { id: "mine", colors: { "--text": "#FFFFFF" } });
    expect(res.status).toBe(200);
    expect(onDisk().themes).toEqual([{ ...mine, colors: { "--text": "#ffffff" }, term: { cursor: "#00ff00" } }]);
  });

  it("refuses by problem word, and rejects a malformed body before the file", async () => {
    const { post, onDisk } = await mountWith({ themes: [mine] });
    const gone = await post("/api/config/themes/colors", { id: "gone", colors: {} });
    expect(gone.status).toBe(409);
    expect(gone.body).toEqual({ error: "missing" });
    expect((await post("/api/config/themes/duplicate", { source: "nope", label: "x" })).body).toEqual({ error: "source" });
    expect((await post("/api/config/themes/colors", { id: "mine", colors: { "--accent": "red" } })).status).toBe(400);
    expect((await post("/api/config/themes/colors", { colors: {} })).status).toBe(400);
    expect(onDisk().themes).toEqual([mine]);
  });

  it("removes a theme by id", async () => {
    const { post, onDisk } = await mountWith({ themes: [mine, { ...mine, id: "other" }] });
    expect((await post("/api/config/themes/remove", { id: "mine" })).status).toBe(200);
    expect(onDisk().themes.map((theme: { id: string }) => theme.id)).toEqual(["other"]);
  });
});
