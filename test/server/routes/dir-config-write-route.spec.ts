// @vitest-environment node
// PUT /api/dir-config (#2722): the Settings form's save, against real files in a scratch directory.
import { describe, it, expect, afterEach } from "vitest";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import express from "express";
import { routeCall } from "../../helpers/routeCall";
import { mountDirConfigWriteRoute } from "../../../server/routes/dir-config-write-route";

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

function scratch(prefix: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}

function setup(files: Record<string, string> = {}) {
  const dir = scratch("mt-dirwrite-");
  const backupRoot = scratch("mt-dirwrite-bk-");
  Object.entries(files).forEach(([name, body]) => writeFileSync(path.join(dir, name), body));
  const signals: string[] = [];
  const app = express();
  app.use(express.json());
  mountDirConfigWriteRoute(app, { backupRoot, onDirConfigWritten: (cwd) => signals.push(cwd) });
  const call = routeCall(app);
  const post = (route: string, body: unknown) => call(route, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const put = (body: unknown) => call("/api/dir-config", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const read = (name: string): unknown => JSON.parse(readFileSync(path.join(dir, name), "utf8"));
  return { dir, backupRoot, signals, put, post, read };
}

describe("PUT /api/dir-config", () => {
  it("creates the shared file, signals, and answers with the detail", async () => {
    const { dir, signals, put, read } = setup();
    const res = await put({ cwd: dir, set: { name: "shop", headerColor: "#112233" } });
    expect(res.status).toBe(200);
    expect(read(".mulmoterminal.json")).toEqual({ name: "shop", headerColor: "#112233" });
    expect(signals).toEqual([dir]);
    expect(res.body.formValues).toEqual({ name: "shop", headerColor: "#112233" });
    expect(res.body.exists).toBe(true);
  });

  it("keeps keys the form does not edit, and backs up the file it replaces", async () => {
    const { dir, backupRoot, put, read } = setup({ ".mulmoterminal.json": JSON.stringify({ sound: "a.mp3", name: "old" }) });
    expect((await put({ cwd: dir, set: { name: "new" } })).status).toBe(200);
    expect(read(".mulmoterminal.json")).toEqual({ sound: "a.mp3", name: "new" });
    expect(readdirSync(backupRoot, { recursive: true }).length).toBeGreaterThan(0);
  });

  it("writes a key the local file holds to the local file", async () => {
    const { dir, put, read } = setup({ ".mulmoterminal.json": '{"name":"shared"}', ".mulmoterminal.local.json": '{"headerColor":"#000000"}' });
    await put({ cwd: dir, set: { headerColor: "#ffffff", name: "renamed" } });
    expect(read(".mulmoterminal.local.json")).toEqual({ headerColor: "#ffffff" });
    expect(read(".mulmoterminal.json")).toEqual({ name: "renamed" });
  });

  it("unsets a key from both files", async () => {
    const { dir, put, read } = setup({ ".mulmoterminal.json": '{"theme":"dark","name":"a"}', ".mulmoterminal.local.json": '{"theme":"light"}' });
    const res = await put({ cwd: dir, unset: ["theme"] });
    expect(res.status).toBe(200);
    expect(read(".mulmoterminal.json")).toEqual({ name: "a" });
    expect(read(".mulmoterminal.local.json")).toEqual({});
    expect(res.body.formValues).toEqual({ name: "a" });
  });

  it("does not create a file only to remove a key from it", async () => {
    const { dir, put } = setup();
    expect((await put({ cwd: dir, unset: ["name"] })).status).toBe(200);
    expect(existsSync(path.join(dir, ".mulmoterminal.json"))).toBe(false);
  });

  it("refuses to write over a file that is not a JSON object, and writes neither file", async () => {
    const broken = '{"name": "a",';
    const { dir, signals, put } = setup({ ".mulmoterminal.json": broken, ".mulmoterminal.local.json": '{"theme":"dark"}' });
    const res = await put({ cwd: dir, set: { name: "b", theme: "light" } });
    expect(res.status).toBe(422);
    expect(res.body.file).toBe(path.join(dir, ".mulmoterminal.json"));
    expect(readFileSync(path.join(dir, ".mulmoterminal.json"), "utf8")).toBe(broken);
    expect(readFileSync(path.join(dir, ".mulmoterminal.local.json"), "utf8")).toBe('{"theme":"dark"}');
    expect(signals).toEqual([]);
  });

  it.each([
    ["an invalid value", { set: { fontSize: 2 } }],
    ["a key the form does not write", { set: { soundFile: "a.mp3" } }],
    ["nothing to change", {}],
  ])("answers 400 for %s and writes nothing", async (_label, edit) => {
    const { dir, put } = setup();
    expect((await put({ cwd: dir, ...edit })).status).toBe(400);
    expect(existsSync(path.join(dir, ".mulmoterminal.json"))).toBe(false);
  });

  it.each([
    ["a missing directory", "/no/such/dir/anywhere"],
    ["a relative path", "relative/dir"],
    ["no cwd", undefined],
  ])("answers 400 for %s", async (_label, cwd) => {
    const { put } = setup();
    expect((await put({ cwd, set: { name: "x" } })).status).toBe(400);
  });

  it("still saves when telling the views fails", async () => {
    const dir = scratch("mt-dirwrite-");
    const app = express();
    app.use(express.json());
    mountDirConfigWriteRoute(app, {
      backupRoot: scratch("mt-dirwrite-bk-"),
      onDirConfigWritten: () => {
        throw new Error("bus down");
      },
    });
    const res = await routeCall(app)("/api/dir-config", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cwd: dir, set: { name: "x" } }),
    });
    expect(res.status).toBe(200);
    expect(existsSync(path.join(dir, ".mulmoterminal.json"))).toBe(true);
  });

  it("moves a key to this checkout's own file and back, signalling each time", async () => {
    const { dir, post, read, signals } = setup({ ".mulmoterminal.json": '{"name":"shop","headerColor":"#111111"}' });
    const toLocal = await post("/api/dir-config/move", { cwd: dir, key: "headerColor", to: "local" });
    expect(toLocal.status).toBe(200);
    expect(read(".mulmoterminal.json")).toEqual({ name: "shop" });
    expect(read(".mulmoterminal.local.json")).toEqual({ headerColor: "#111111" });
    expect(toLocal.body.source).toMatchObject({ local: ["headerColor"] });
    expect((await post("/api/dir-config/move", { cwd: dir, key: "headerColor", to: "shared" })).status).toBe(200);
    expect(read(".mulmoterminal.json")).toEqual({ name: "shop", headerColor: "#111111" });
    expect(read(".mulmoterminal.local.json")).toEqual({});
    expect(signals).toEqual([dir, dir]);
  });

  it("answers 409 for a key the source file does not hold, and 400 for a bad request", async () => {
    const { dir, post } = setup({ ".mulmoterminal.json": '{"name":"shop"}' });
    expect((await post("/api/dir-config/move", { cwd: dir, key: "theme", to: "local" })).status).toBe(409);
    expect((await post("/api/dir-config/move", { cwd: dir, key: "colour", to: "local" })).status).toBe(400);
    expect((await post("/api/dir-config/move", { cwd: dir, key: "name", to: "elsewhere" })).status).toBe(400);
  });
});
