// @vitest-environment node
// GET /api/dir-background. Like the icon route, the path comes only from the directory's own
// `.mulmoterminal.json`, and the file is served under the same headers.
import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import express from "express";
import { routeCall } from "../../helpers/routeCall";
import { mountDirRoutes } from "../../../server/routes/dir-routes";

const app = express();
mountDirRoutes(app);
const call = routeCall(app);

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

function projectWith(background: unknown, files: Record<string, string> = {}): string {
  const dir = mkdtempSync(path.join(tmpdir(), "mt-bgroute-"));
  dirs.push(dir);
  Object.entries(files).forEach(([name, body]) => {
    mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    writeFileSync(path.join(dir, name), body);
  });
  writeFileSync(path.join(dir, ".mulmoterminal.json"), JSON.stringify({ backgroundImage: background }));
  return dir;
}

const fetchFor = (dir: string) => call(`/api/dir-background?${new URLSearchParams({ cwd: dir })}`);

describe("GET /api/dir-background", () => {
  it("serves the directory's own image, typed and sandboxed like the icon", async () => {
    const res = await fetchFor(projectWith("art/wall.svg", { "art/wall.svg": "<svg xmlns='http://www.w3.org/2000/svg'/>" }));
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("image/svg+xml");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["content-security-policy"]).toBe("sandbox");
  });

  it("serves the image named in the object spelling", async () => {
    const res = await fetchFor(projectWith({ image: "wall.png", opacity: 0.3 }, { "wall.png": "png-bytes" }));
    expect(res.status).toBe(200);
    expect(res.text).toBe("png-bytes");
  });

  it("serves the background, not the icon, when a directory sets both", async () => {
    const dir = projectWith("wall.png", { "wall.png": "wall", "logo.png": "logo" });
    writeFileSync(path.join(dir, ".mulmoterminal.json"), JSON.stringify({ icon: "logo.png", backgroundImage: "wall.png" }));
    expect((await fetchFor(dir)).text).toBe("wall");
  });

  it("404s when the directory sets no background", async () => {
    expect((await fetchFor(projectWith(undefined))).status).toBe(404);
  });

  it("404s for a remote background, which the browser loads itself", async () => {
    expect((await fetchFor(projectWith("https://example.com/wall.png"))).status).toBe(404);
  });

  it("404s for a path outside the directory, or a file that is not an image", async () => {
    expect((await fetchFor(projectWith("../outside.png"))).status).toBe(404);
    expect((await fetchFor(projectWith("notes.txt", { "notes.txt": "x" }))).status).toBe(404);
  });
});
