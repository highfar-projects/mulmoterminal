// @vitest-environment node
// POST /api/dir-config/entries (#2727): a directory's buttons, chips and palette commands changed one
// entry at a time, against real files in a scratch directory.
import { describe, it, expect, afterEach } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import express from "express";
import { routeCall, jsonPost } from "../../helpers/routeCall";
import { mountDirConfigEntriesRoute } from "../../../server/routes/dir-config-entries-route";

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

function setup(config: Record<string, unknown> | null = null) {
  const dir = mkdtempSync(path.join(tmpdir(), "mt-direntries-"));
  const backupRoot = mkdtempSync(path.join(tmpdir(), "mt-direntries-bk-"));
  dirs.push(dir, backupRoot);
  if (config) writeFileSync(path.join(dir, ".mulmoterminal.json"), JSON.stringify(config));
  const signals: string[] = [];
  const app = express();
  app.use(express.json());
  mountDirConfigEntriesRoute(app, { backupRoot, onDirConfigWritten: (cwd) => signals.push(cwd) });
  const post = (body: Record<string, unknown>) => routeCall(app)("/api/dir-config/entries", jsonPost({ cwd: dir, ...body }));
  const file = () => (existsSync(path.join(dir, ".mulmoterminal.json")) ? JSON.parse(readFileSync(path.join(dir, ".mulmoterminal.json"), "utf8")) : null);
  return { dir, post, file, signals };
}

const build = { id: "build", label: "Build", run: "shell", cmd: "yarn build" };

describe("POST /api/dir-config/entries", () => {
  it("adds a button to a directory with none, starting from nothing rather than the built-in set", async () => {
    const { post, file, signals, dir } = setup({ name: "shop" });
    const res = await post({ list: "buttons", action: "add", run: "input", label: "Compact", payload: "/compact" });
    expect(res.status).toBe(200);
    expect(file()).toEqual({ name: "shop", buttons: [{ id: "compact", label: "Compact", run: "input", text: "/compact" }] });
    expect(res.body.formValues).toMatchObject({ buttons: [{ id: "compact" }] });
    expect(signals).toEqual([dir]);
  });

  it("adds a palette command and a chip the same way", async () => {
    const { post, file } = setup();
    expect((await post({ list: "commands", action: "add", run: "shell", label: "Release", payload: "make release" })).status).toBe(200);
    expect((await post({ list: "chips", action: "add", builtin: "git" })).status).toBe(200);
    expect(file()).toEqual({ commands: [{ id: "release", label: "Release", run: "shell", cmd: "make release" }], chips: ["git"] });
  });

  it("takes the key out when the last entry goes, and on reset", async () => {
    const { post, file } = setup({ buttons: [build], chips: ["git", "diff"] });
    expect((await post({ list: "buttons", action: "remove", id: "build" })).status).toBe(200);
    expect(file()).toEqual({ chips: ["git", "diff"] });
    expect((await post({ list: "chips", action: "reset" })).status).toBe(200);
    expect(file()).toEqual({});
  });

  it("answers 409 with the directory as it is when the list moved under the caller", async () => {
    const { post, file } = setup({ chips: ["git"] });
    const res = await post({ list: "chips", action: "remove", index: 0, chip: "diff" });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("stale");
    expect(res.body.detail).toMatchObject({ formValues: { chips: ["git"] } });
    expect(file()).toEqual({ chips: ["git"] });
  });

  it.each([
    ["an unknown list", { list: "sounds", action: "add" }],
    ["no action", { list: "buttons" }],
    ["a malformed change", { list: "buttons", action: "remove" }],
  ])("answers 400 for %s and writes nothing", async (_label, body) => {
    const { post, file } = setup();
    expect((await post(body)).status).toBe(400);
    expect(file()).toBeNull();
  });

  it("refuses a directory that does not exist", async () => {
    const app = express();
    app.use(express.json());
    mountDirConfigEntriesRoute(app, { backupRoot: tmpdir(), onDirConfigWritten: () => {} });
    const res = await routeCall(app)("/api/dir-config/entries", jsonPost({ cwd: "/no/such/dir", list: "buttons", action: "reset" }));
    expect(res.status).toBe(400);
  });
});
