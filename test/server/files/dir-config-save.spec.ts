// @vitest-environment node
//
// #2624. Saving a directory's .mulmoterminal.json from the Files pane applies it at once (every view
// is told to re-read that directory's config, the signal an agent's write already sends) and says
// whether it took. Any other file is written exactly as before.
import { describe, it, expect, vi } from "vitest";
import { mkdirSync, rmSync, realpathSync } from "node:fs";
import path from "node:path";
import express from "express";
import { makeTempDir } from "../../support/tempDir.js";
import { routeCall, jsonPost } from "../../helpers/routeCall";
import { mountFilesBrowseRoutes } from "../../../server/files/files-browse";

const query = (dir: string, file: string) => `cwd=${encodeURIComponent(dir)}&path=${encodeURIComponent(file)}`;

async function withProject(
  run: (save: (file: string, text: string) => ReturnType<ReturnType<typeof routeCall>>, told: string[], dir: string) => Promise<void>,
) {
  const dir = realpathSync(makeTempDir("mt-dircfg-"));
  const told: string[] = [];
  const app = express();
  app.use(express.json());
  mountFilesBrowseRoutes(app, { defaultCwd: dir, backupRoot: path.join(dir, ".backups"), onDirConfigWritten: (cwd) => told.push(cwd) });
  const call = routeCall(app);
  const save = async (file: string, text: string) => {
    const read = await call(`/api/files/browse/text?${query(dir, file)}`);
    const baseVersion = read.status === 200 ? read.body.version : null;
    return call(`/api/files/browse/write?${query(dir, file)}`, { ...jsonPost({ text, baseVersion }), method: "PUT" });
  };
  try {
    await run(save, told, dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("saving a directory's config file from the Files pane", () => {
  it("tells every view about the directory and reports a clean save", async () => {
    await withProject(async (save, told, dir) => {
      const res = await save(".mulmoterminal.json", JSON.stringify({ name: "shop", headerColor: "#112233" }));
      expect(res.status).toBe(200);
      expect(told).toEqual([dir]);
      expect(res.body.dirConfig).toEqual({ parsed: true, ignored: [], unknown: [] });
    });
  });

  it("names the keys that did not take, and the ones it does not know", async () => {
    await withProject(async (save) => {
      const res = await save(".mulmoterminal.json", JSON.stringify({ name: "shop", headerColor: "red", colour: "#112233" }));
      expect(res.body.dirConfig).toEqual({ parsed: true, ignored: ["headerColor"], unknown: ["colour"] });
    });
  });

  it("says a file that is not a JSON object applies nothing, and still saves it", async () => {
    await withProject(async (save, told, dir) => {
      const res = await save(".mulmoterminal.json", '{ "name": "shop", }');
      expect(res.status).toBe(200);
      expect(res.body.dirConfig).toMatchObject({ parsed: false });
      expect(told).toEqual([dir]);
    });
  });

  it("covers the local override too, and the config of a subdirectory names that subdirectory", async () => {
    await withProject(async (save, told, dir) => {
      mkdirSync(path.join(dir, "web"));
      await save(".mulmoterminal.local.json", JSON.stringify({ name: "mine" }));
      await save("web/.mulmoterminal.json", JSON.stringify({ name: "web" }));
      expect(told).toEqual([dir, path.join(dir, "web")]);
    });
  });

  it("leaves every other file as it was: no signal, no report", async () => {
    await withProject(async (save, told) => {
      const res = await save("notes.json", JSON.stringify({ name: "x" }));
      expect(res.status).toBe(200);
      expect(res.body.dirConfig).toBeUndefined();
      expect(told).toEqual([]);
    });
  });

  it("still answers the save when telling the views throws", async () => {
    const dir = realpathSync(makeTempDir("mt-dircfg-"));
    const app = express();
    app.use(express.json());
    const onDirConfigWritten = vi.fn(() => {
      throw new Error("bus down");
    });
    mountFilesBrowseRoutes(app, { defaultCwd: dir, backupRoot: path.join(dir, ".backups"), onDirConfigWritten });
    const res = await routeCall(app)(`/api/files/browse/write?${query(dir, ".mulmoterminal.json")}`, {
      ...jsonPost({ text: "{}", baseVersion: null }),
      method: "PUT",
    });
    expect(res.status).toBe(200);
    expect(onDirConfigWritten).toHaveBeenCalledTimes(1);
    expect(res.body.dirConfig).toEqual({ parsed: true, ignored: [], unknown: [] });
    rmSync(dir, { recursive: true, force: true });
  });
});
