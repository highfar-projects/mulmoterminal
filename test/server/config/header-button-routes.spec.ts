// @vitest-environment node
//
// #2622. The global header buttons are changed one entry at a time against the file, by id.
// The built-in set is where an unconfigured list starts, and reset removes the key again.
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
  const dir = mkdtempSync(path.join(tmpdir(), "mt-buttons-"));
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

const build = { id: "build", label: "Build", run: "shell", cmd: "yarn build" };

describe("header buttons, one entry at a time", () => {
  it("adds to the list ON DISK, keeping a button written there since boot", async () => {
    const { post, onDisk, writeOnDisk } = await mountWith({ buttons: [] });
    writeOnDisk({ buttons: [build], prRepos: ["acme/app"] });
    const res = await post("/api/config/buttons/add", { run: "input", label: "Compact", payload: "/compact", icon: "compress" });
    expect(res.status).toBe(200);
    expect(onDisk().buttons).toEqual([build, { id: "compact", label: "Compact", run: "input", text: "/compact", icon: "compress" }]);
    expect(onDisk().prRepos).toEqual(["acme/app"]);
  });

  it("adds an open button and an action button as the loader reads them", async () => {
    const { post, onDisk } = await mountWith({ buttons: [] });
    expect((await post("/api/config/buttons/add", { run: "open", target: "view", payload: "wiki", label: "Wiki" })).status).toBe(200);
    expect((await post("/api/config/buttons/add", { run: "action", payload: "pane-files", label: "Files", icon: "folder" })).status).toBe(200);
    expect(onDisk().buttons).toEqual([
      { id: "wiki", label: "Wiki", run: "open", open: { view: "wiki" } },
      { id: "files", label: "Files", run: "action", action: "pane-files", icon: "folder" },
    ]);
    expect((await post("/api/config/buttons/add", { run: "action", payload: "nope", label: "X" })).body).toMatchObject({ error: "action" });
  });

  it("edits a button in place by id, keeping its order, and refuses a folder", async () => {
    const folder = { id: "tools", label: "Tools", items: [{ ...build, id: "inner" }] };
    const { post, onDisk } = await mountWith({ buttons: [{ ...build, order: 2 }, folder] });
    const res = await post("/api/config/buttons/edit", { id: "build", run: "input", label: "Compact", payload: "/compact" });
    expect(res.status).toBe(200);
    expect(onDisk().buttons[0]).toEqual({ id: "build", label: "Compact", run: "input", text: "/compact", order: 2 });
    expect((await post("/api/config/buttons/edit", { id: "tools", run: "shell", label: "x", payload: "y" })).body).toMatchObject({ error: "folder" });
    expect((await post("/api/config/buttons/edit", { run: "shell", label: "x", payload: "y" })).status).toBe(400);
  });

  it("makes a folder from a button, takes it out again, and the empty folder goes", async () => {
    const test = { ...build, id: "test", label: "Test", cmd: "yarn test" };
    const { post, onDisk } = await mountWith({ buttons: [build, test] });
    expect((await post("/api/config/buttons/into-folder", { id: "build", folderLabel: "Tools", folderIcon: "build" })).status).toBe(200);
    expect((await post("/api/config/buttons/into-folder", { id: "test", folderId: "tools" })).status).toBe(200);
    expect(onDisk().buttons).toEqual([{ id: "tools", label: "Tools", icon: "build", items: [build, test] }]);
    expect((await post("/api/config/buttons/folder-edit", { id: "tools", label: "More", icon: "", when: "isGitRepo" })).status).toBe(200);
    expect((await post("/api/config/buttons/out-of-folder", { id: "build" })).status).toBe(200);
    expect((await post("/api/config/buttons/remove", { id: "test" })).status).toBe(200);
    expect(onDisk().buttons).toEqual([build]);
    expect((await post("/api/config/buttons/into-folder", {})).status).toBe(400);
  });

  it("keeps the built-in PR button when the first button is added", async () => {
    const { post, onDisk } = await mountWith({});
    expect((await post("/api/config/buttons/add", { run: "shell", label: "Build", payload: "yarn build" })).status).toBe(200);
    expect(onDisk().buttons.map((entry: { id: string }) => entry.id)).toEqual(["pr", "build"]);
  });

  it("removes and moves by id, and names the problem when it cannot", async () => {
    const test = { ...build, id: "test", label: "Test", cmd: "yarn test" };
    const { post, onDisk } = await mountWith({ buttons: [build, test] });
    expect((await post("/api/config/buttons/move", { id: "test", delta: -1 })).status).toBe(200);
    expect(onDisk().buttons.map((entry: { id: string }) => entry.id)).toEqual(["test", "build"]);
    const edge = await post("/api/config/buttons/move", { id: "test", delta: -1 });
    expect(edge.status).toBe(409);
    expect(edge.body).toEqual({ error: "edge", buttons: [test, build] });
    expect((await post("/api/config/buttons/remove", { id: "gone" })).body).toMatchObject({ error: "missing" });
    expect((await post("/api/config/buttons/remove", { id: "build" })).status).toBe(200);
    expect(onDisk().buttons.map((entry: { id: string }) => entry.id)).toEqual(["test"]);
  });

  it("rejects a malformed request before touching the file", async () => {
    const { post, onDisk } = await mountWith({ buttons: [build] });
    expect((await post("/api/config/buttons/add", { run: "folder", label: "x", payload: "y" })).status).toBe(400);
    expect((await post("/api/config/buttons/move", { id: "build", delta: 2 })).status).toBe(400);
    expect((await post("/api/config/buttons/remove", {})).status).toBe(400);
    expect((await post("/api/config/buttons/add", { run: "shell", label: "x", payload: " " })).body).toEqual({ error: "payload", buttons: [build] });
    expect(onDisk().buttons).toEqual([build]);
  });

  it("reset removes the key, so the built-in set applies again", async () => {
    const { post, onDisk } = await mountWith({ buttons: [build] });
    const res = await post("/api/config/buttons/reset", {});
    expect(res.body).toEqual({ buttons: null });
    expect(onDisk().buttons ?? null).toBeNull();
  });
});
