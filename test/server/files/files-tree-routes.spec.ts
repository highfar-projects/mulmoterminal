// @vitest-environment node
import { describe, it, expect, afterEach } from "vitest";
import { mkdirSync, writeFileSync, symlinkSync, existsSync, readFileSync, readdirSync, rmSync, realpathSync } from "node:fs";
import path from "node:path";
import express from "express";
import { makeTempDir } from "../../support/tempDir.js";
import { routeCall, jsonPost } from "../../helpers/routeCall";
import { mountFilesTreeRoutes } from "../../../server/files/files-tree-routes";
import type { TrashLayout } from "../../../server/files/tree-ops";

// #2578. The routes behind the tree's file operations, over a real directory and a Trash of its own.
const dirs: string[] = [];
const tmp = (): string => {
  const dir = realpathSync(makeTempDir("mt-tree-routes-"));
  dirs.push(dir);
  return dir;
};
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

function serve(root: string | null, trash: TrashLayout) {
  const app = express();
  app.use(express.json());
  mountFilesTreeRoutes(app, { base: () => root, trash: () => trash });
  return app;
}
const q = (rel: string): string => `path=${encodeURIComponent(rel)}`;
const post = (app: express.Express, url: string, body: unknown) => routeCall(app)(url, jsonPost(body));

describe("POST /api/files/browse/create", () => {
  it("makes a file or folder in the named folder and answers its path", async () => {
    const root = tmp();
    mkdirSync(path.join(root, "src"));
    const app = serve(root, null);
    const file = await routeCall(app)(`/api/files/browse/create?${q("src")}`, jsonPost({ name: "a.ts", kind: "file" }));
    expect(file.status).toBe(200);
    expect(file.body).toEqual({ ok: true, path: "src/a.ts" });
    const dir = await routeCall(app)(`/api/files/browse/create?${q("")}`, jsonPost({ name: "docs", kind: "dir" }));
    expect(dir.body).toEqual({ ok: true, path: "docs" });
    expect(existsSync(path.join(root, "src", "a.ts")) && existsSync(path.join(root, "docs"))).toBe(true);
  });

  it.each([
    ["an existing name", { name: "a.ts", kind: "file" }, 409],
    ["a name with a separator", { name: "x/y", kind: "file" }, 400],
    ["no kind", { name: "b.ts" }, 400],
  ])("refuses %s", async (_case, body, status) => {
    const root = tmp();
    writeFileSync(path.join(root, "a.ts"), "keep");
    const res = await post(serve(root, null), `/api/files/browse/create?${q("")}`, body);
    expect(res.status).toBe(status);
    expect(readFileSync(path.join(root, "a.ts"), "utf8")).toBe("keep");
  });

  it("refuses a folder outside the root, or reached through a link out", async () => {
    const root = tmp();
    const outside = tmp();
    symlinkSync(outside, path.join(root, "out"));
    const app = serve(root, null);
    expect((await routeCall(app)(`/api/files/browse/create?${q("..")}`, jsonPost({ name: "x", kind: "file" }))).status).toBe(403);
    expect((await routeCall(app)(`/api/files/browse/create?${q("out")}`, jsonPost({ name: "x", kind: "file" }))).status).toBe(403);
    expect(existsSync(path.join(outside, "x"))).toBe(false);
  });
});

describe("POST /api/files/browse/rename", () => {
  it("renames in place and answers the new path", async () => {
    const root = tmp();
    mkdirSync(path.join(root, "src"));
    writeFileSync(path.join(root, "src", "a.ts"), "a");
    const res = await post(serve(root, null), `/api/files/browse/rename?${q("src/a.ts")}`, { name: "b.ts" });
    expect(res.body).toEqual({ ok: true, path: "src/b.ts" });
    expect(readFileSync(path.join(root, "src", "b.ts"), "utf8")).toBe("a");
  });

  it.each([
    ["onto an existing name", "a.ts", { name: "b.ts" }, 409],
    ["something missing", "none.ts", { name: "c.ts" }, 404],
    ["the root", "", { name: "c" }, 403],
    ["to a path", "a.ts", { name: "../c.ts" }, 400],
  ])("refuses a rename %s", async (_case, rel, body, status) => {
    const root = tmp();
    writeFileSync(path.join(root, "a.ts"), "a");
    writeFileSync(path.join(root, "b.ts"), "b");
    expect((await post(serve(root, null), `/api/files/browse/rename?${q(rel)}`, body)).status).toBe(status);
    expect(readFileSync(path.join(root, "b.ts"), "utf8")).toBe("b");
  });
});

describe("/api/files/browse/trash", () => {
  it("says whether there is a Trash", async () => {
    expect((await routeCall(serve(tmp(), null))("/api/files/browse/trash")).body).toEqual({ available: false });
    expect((await routeCall(serve(tmp(), { kind: "mac", files: tmp() }))("/api/files/browse/trash")).body).toEqual({ available: true });
  });

  it("moves the entry to the Trash", async () => {
    const root = tmp();
    const trash = tmp();
    writeFileSync(path.join(root, "a.md"), "a");
    const res = await post(serve(root, { kind: "mac", files: trash }), `/api/files/browse/trash?${q("a.md")}`, {});
    expect(res.status).toBe(200);
    expect(existsSync(path.join(root, "a.md"))).toBe(false);
    expect(readFileSync(path.join(trash, "a.md"), "utf8")).toBe("a");
  });

  it("deletes nothing where there is no Trash, and nothing outside the root", async () => {
    const root = tmp();
    writeFileSync(path.join(root, "a.md"), "a");
    expect((await post(serve(root, null), `/api/files/browse/trash?${q("a.md")}`, {})).status).toBe(501);
    expect((await post(serve(root, { kind: "mac", files: tmp() }), `/api/files/browse/trash?${q("../a.md")}`, {})).status).toBe(403);
    expect((await post(serve(root, { kind: "mac", files: tmp() }), `/api/files/browse/trash?${q("")}`, {})).status).toBe(403);
    expect(existsSync(path.join(root, "a.md"))).toBe(true);
  });

  it("answers 404 for an entry that is not there, and leaves the Trash empty", async () => {
    const trash = tmp();
    const res = await post(serve(tmp(), { kind: "mac", files: trash }), `/api/files/browse/trash?${q("none.md")}`, {});
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "not found" });
    expect(readdirSync(trash)).toEqual([]);
  });
});

// The pane's folder was removed while its tree was on screen: the request names it, and it is gone.
// Falling back to the default folder would rename or trash a same-named entry there.
describe("a pane whose folder is gone", () => {
  it.each([
    ["create", { name: "a.md", kind: "file" }],
    ["rename", { name: "b.md" }],
    ["trash", {}],
  ])("refuses to %s anything", async (route, body) => {
    const res = await post(serve(null, { kind: "mac", files: tmp() }), `/api/files/browse/${route}?${q("a.md")}`, body);
    expect(res.status).toBe(404);
  });
});
