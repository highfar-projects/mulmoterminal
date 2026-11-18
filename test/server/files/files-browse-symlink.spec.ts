// @vitest-environment node
// Fork-only: the Files pane following symlinks and Windows junctions. Its own file because
// files-browse.spec.ts is at its line budget.
import { describe, it, expect } from "vitest";
import { makeTempDir } from "../../support/tempDir.js";
import { existsSync, realpathSync, writeFileSync, mkdirSync, rmSync, symlinkSync } from "node:fs";
import path from "node:path";
import express from "express";
import { routeCall, jsonPost } from "../../helpers/routeCall";
import { listEntries, mountFilesBrowseRoutes } from "../../../server/files/files-browse";
import { canSymlink } from "../../support/canSymlink";

const tmp = () => makeTempDir("mt-files-");

describe("listEntries", () => {
  // A symlink — or, on Windows, a directory junction — reports its OWN entry type (DT_LNK), not
  // the target's; Dirent.isDirectory() never follows it. Without the following stat, a junctioned
  // project folder came back as a bogus zero-size "file" the Files pane could not open as either
  // (it isn't real text, and the folder-toggle only ever fires for entries already marked `dir`).
  it.runIf(canSymlink)("resolves a symlinked directory as a directory, not a bogus file", () => {
    const dir = tmp();
    const target = tmp();
    mkdirSync(path.join(target, "inner"));
    writeFileSync(path.join(target, "inner", "a.txt"), "hi");
    symlinkSync(target, path.join(dir, "linked"));
    const entries = listEntries(dir);
    expect(entries).toEqual([{ name: "linked", dir: true, size: 0 }]);
    rmSync(dir, { recursive: true, force: true });
    rmSync(target, { recursive: true, force: true });
  });

  it.runIf(canSymlink)("still reports a symlinked file's real size, as it already did", () => {
    const dir = tmp();
    const target = tmp();
    writeFileSync(path.join(target, "real.txt"), "hello");
    symlinkSync(path.join(target, "real.txt"), path.join(dir, "linked.txt"));
    const entries = listEntries(dir);
    expect(entries).toEqual([{ name: "linked.txt", dir: false, size: 5 }]);
    rmSync(dir, { recursive: true, force: true });
    rmSync(target, { recursive: true, force: true });
  });

  it.runIf(canSymlink)("shows a broken symlink as an (unopenable) file rather than throwing", () => {
    const dir = tmp();
    symlinkSync(path.join(dir, "does-not-exist"), path.join(dir, "broken"));
    const entries = listEntries(dir);
    expect(entries).toEqual([{ name: "broken", dir: false, size: 0 }]);
    rmSync(dir, { recursive: true, force: true });
  });
});

// The Files pane's own tree (unlike /api/files/raw) follows a symlink/junction out of the
// project root instead of refusing it — see pathContainment.ts's resolveContained and
// files-browse.ts's containedFor for why that risk differs from a one-click, agent-authored path.
describe("browsing through a symlink that leaves the project root", () => {
  it.runIf(canSymlink)("lists and opens what it points at, instead of 403ing", async () => {
    const dir = tmp();
    const outside = tmp();
    writeFileSync(path.join(outside, "note.txt"), "from outside the project");
    symlinkSync(outside, path.join(dir, "linked"));

    const app = express();
    app.use(express.json());
    mountFilesBrowseRoutes(app, { defaultCwd: dir, backupRoot: path.join(dir, ".backups") });

    const list = await routeCall(app)(`/api/files/browse/list?cwd=${encodeURIComponent(dir)}&path=linked`);
    expect(list.status).toBe(200);
    expect(list.body.entries).toEqual([{ name: "note.txt", dir: false, size: 24 }]);

    const text = await routeCall(app)(`/api/files/browse/text?cwd=${encodeURIComponent(dir)}&path=${encodeURIComponent("linked/note.txt")}`);
    expect(text.status).toBe(200);
    expect(text.body.text).toBe("from outside the project");

    rmSync(dir, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  });
});

const serveProject = (dir: string) => {
  const app = express();
  app.use(express.json());
  mountFilesBrowseRoutes(app, { defaultCwd: dir, backupRoot: path.join(dir, ".backups") });
  return app;
};

// #3301 (upstream). Upstream also pins a READ behind a link out answering 403 with
// `escape: "symlink"`; this fork follows links on reads (above), so only the refusals both share
// are kept here: a climb out by spelling carries no symlink field, and a write through a link is
// still refused with one.
describe("a 403 says when a symlink is what leads out", () => {
  it("not for a climb out by spelling", async () => {
    const dir = realpathSync(tmp());
    const res = await routeCall(serveProject(dir))(`/api/files/browse/version?cwd=${encodeURIComponent(dir)}&path=../clip.mp4`);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "path escapes the project root" });
  });
});

// #3303 (upstream). A save through a link whose target does not exist yet would create that target.
describe("a link out whose target does not exist yet", () => {
  it.runIf(canSymlink)("is refused by /browse/write, and nothing is created where it points", async () => {
    const dir = realpathSync(tmp());
    const planted = path.join(realpathSync(tmp()), "planted.txt");
    symlinkSync(planted, path.join(dir, "notes.txt"));
    const res = await routeCall(serveProject(dir))(`/api/files/browse/write?cwd=${encodeURIComponent(dir)}&path=notes.txt`, {
      ...jsonPost({ text: "written through link\n", baseVersion: null }),
      method: "PUT",
    });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ escape: "symlink" });
    expect(existsSync(planted)).toBe(false);
  });
});
