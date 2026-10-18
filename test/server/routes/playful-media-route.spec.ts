// @vitest-environment node
// GET /api/playful-media and its files. The config is the allowlist: a file is reached by its index
// in the list the config makes, never by a path in the request.
import { describe, it, expect, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import express from "express";
import { routeCall } from "../../helpers/routeCall";
import { sanitizePlayfulMedia, type PlayfulMedia } from "../../../common/playfulMedia";

const current: { media: PlayfulMedia } = { media: sanitizePlayfulMedia(undefined) };
vi.mock("../../../server/config/config-routes.js", () => ({ getPlayfulMedia: () => current.media }));

const { mountPlayfulMediaRoutes } = await import("../../../server/routes/playful-media-routes");
const app = express();
mountPlayfulMediaRoutes(app);
const call = routeCall(app);

const dirs: string[] = [];
afterEach(() => {
  dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true }));
  current.media = sanitizePlayfulMedia(undefined);
});

function filesIn(names: Record<string, string>): string {
  const dir = mkdtempSync(path.join(tmpdir(), "mt-playful-"));
  dirs.push(dir);
  Object.entries(names).forEach(([name, body]) => writeFileSync(path.join(dir, name), body));
  return dir;
}

const SVG = "<svg xmlns='http://www.w3.org/2000/svg'/>";

describe("GET /api/playful-media", () => {
  it("lists only the files that play, by index, without their paths", async () => {
    const dir = filesIn({ "a.svg": SVG, "b.webm": "x" });
    current.media = sanitizePlayfulMedia({
      files: [path.join(dir, "missing.gif"), path.join(dir, "a.svg"), { file: path.join(dir, "b.webm"), finale: path.join(dir, "a.svg") }],
    });
    const res = await call("/api/playful-media");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      builtIn: true,
      items: [
        { media: { kind: "image", url: expect.stringMatching(/^\/api\/playful-media\/0\?v=\d+$/) }, finale: null },
        {
          media: { kind: "video", url: expect.stringMatching(/^\/api\/playful-media\/1\?v=\d+$/) },
          finale: { kind: "image", url: expect.stringMatching(/^\/api\/playful-media\/1\/finale\?v=\d+$/) },
        },
      ],
    });
    expect(JSON.stringify(res.body)).not.toContain(dir);
  });

  it("serves a listed file typed from its extension and sandboxed", async () => {
    const dir = filesIn({ "a.svg": SVG });
    current.media = sanitizePlayfulMedia({ files: [path.join(dir, "a.svg")] });
    const res = await call("/api/playful-media/0");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("image/svg+xml");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["content-security-policy"]).toBe("sandbox");
  });

  it("serves an entry's finale under its own path", async () => {
    const dir = filesIn({ "a.svg": SVG, "b.webm": "x" });
    current.media = sanitizePlayfulMedia({ files: [{ file: path.join(dir, "a.svg"), finale: path.join(dir, "b.webm") }] });
    const res = await call("/api/playful-media/0/finale");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("video/webm");
  });

  // Digits only: "0x0", "0.0" and "0e0" all read as 0 to Number() and would otherwise reach entry 0.
  it.each(["1", "-1", "0abc", "x", "00x", "0x0", "0.0", "0e0"])("is a 404 for an index that names nothing (%s)", async (index) => {
    const dir = filesIn({ "a.svg": SVG });
    current.media = sanitizePlayfulMedia({ files: [path.join(dir, "a.svg")] });
    expect((await call(`/api/playful-media/${index}`)).status).toBe(404);
  });

  it("is a 404 for the finale of an entry that has none", async () => {
    const dir = filesIn({ "a.svg": SVG });
    current.media = sanitizePlayfulMedia({ files: [path.join(dir, "a.svg")] });
    expect((await call("/api/playful-media/0/finale")).status).toBe(404);
  });

  it("follows the config as it is now, so a removed file stops being served", async () => {
    const dir = filesIn({ "a.svg": SVG });
    current.media = sanitizePlayfulMedia({ files: [path.join(dir, "a.svg")] });
    expect((await call("/api/playful-media/0")).status).toBe(200);
    current.media = sanitizePlayfulMedia({ files: [] });
    expect((await call("/api/playful-media/0")).status).toBe(404);
  });
});
