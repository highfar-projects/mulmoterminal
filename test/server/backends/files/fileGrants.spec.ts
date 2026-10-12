// @vitest-environment node
import { describe, it, expect, beforeAll, vi } from "vitest";
import express from "express";
import { mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { appRequest } from "../../../helpers/appRequest.js";
import { mountFileGrantRoutes } from "../../../../server/backends/files/fileGrants.js";
import { mountFilesRoutes } from "../../../../server/backends/files/files.js";
import { makeTempDir } from "../../../support/tempDir";
import { initProjectRoots } from "../../../../server/infra/fs/project-root.js";

let request: ReturnType<typeof appRequest>;
let outside: string;
let home: string;
const clip = Buffer.from(Array.from({ length: 64 }, (_, i) => i));

beforeAll(() => {
  const ws = makeTempDir("mt-grant-ws-");
  outside = makeTempDir("mt-grant-outside-");
  home = makeTempDir("mt-grant-home-");
  vi.spyOn(os, "homedir").mockReturnValue(home);
  writeFileSync(path.join(outside, "clip.mp4"), clip);
  writeFileSync(path.join(outside, "secret.png"), Buffer.from([1, 2, 3]));
  writeFileSync(path.join(outside, "notes.txt"), "text");
  writeFileSync(path.join(outside, "page.html"), '<p>hi</p><img src="secret.png">');
  mkdirSync(path.join(outside, "dir.mp4"));
  mkdirSync(path.join(home, "Movies"));
  writeFileSync(path.join(home, "Movies", "home.mp4"), clip);
  initProjectRoots({ workspace: ws, knownProjects: () => [] });
  const app = express();
  app.use(express.json());
  mountFileGrantRoutes(app);
  mountFilesRoutes(app, { workspace: ws, sessionCwds: () => [outside] });
  request = appRequest(app);
});

const grant = async (filePath: string) => {
  const res = await request("/api/files/grant", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ path: filePath }) });
  return { status: res.status, body: (await res.json()) as { url?: string; error?: string } };
};

describe("one-file grants for a file outside the served directories", () => {
  it("serves the granted video, with Range for seeking", async () => {
    const { status, body } = await grant(path.join(outside, "clip.mp4"));
    expect(status).toBe(200);
    expect(body.url).toMatch(/^\/api\/files\/granted\/[0-9a-f]{48}\/clip\.mp4$/);
    const full = await request(body.url ?? "");
    expect(full.status).toBe(200);
    expect(full.headers.get("content-type")).toBe("video/mp4");
    expect(Buffer.from(await full.arrayBuffer())).toEqual(clip);
    const part = await request(body.url ?? "", { headers: { range: "bytes=0-15" } });
    expect(part.status).toBe(206);
    expect(part.headers.get("content-range")).toBe("bytes 0-15/64");
  });

  it("expands a ~ path", async () => {
    const { status, body } = await grant("~/Movies/home.mp4");
    expect(status).toBe(200);
    expect((await request(body.url ?? "")).status).toBe(200);
  });

  // The property the raw route's extraction was proved against: a granted file goes out exactly as
  // the raw route sends the same file from a directory it serves.
  it("sends a granted file exactly as the raw route sends it", async () => {
    const { body } = await grant(path.join(outside, "clip.mp4"));
    const ranges = [undefined, "bytes=0-15", "bytes=10-", "bytes=-5", "bytes=100-200", "bytes=9-3", "nonsense"];
    for (const range of ranges) {
      const init = range ? { headers: { range } } : {};
      const [granted, raw] = await Promise.all([
        request(body.url ?? "", init),
        request(`/api/files/raw?cwd=${encodeURIComponent(outside)}&path=clip.mp4`, init),
      ]);
      const headersOf = (r: Response) => [...r.headers.entries()].filter(([name]) => name !== "date").sort();
      expect({ range, status: granted.status, headers: headersOf(granted), body: Buffer.from(await granted.arrayBuffer()) }).toEqual({
        range,
        status: raw.status,
        headers: headersOf(raw),
        body: Buffer.from(await raw.arrayBuffer()),
      });
    }
  });

  it("serves only the granted name: not a sibling, not under a made-up token", async () => {
    const { body } = await grant(path.join(outside, "clip.mp4"));
    const url = body.url ?? "";
    expect((await request(url.replace(/clip\.mp4$/, "secret.png"))).status).toBe(404);
    expect((await request(url.replace(/[0-9a-f]{48}/, "0".repeat(48)))).status).toBe(404);
  });

  it("serves an HTML page under the preview CSP, and not the image it links beside itself", async () => {
    const { body } = await grant(path.join(outside, "page.html"));
    const page = await request(body.url ?? "");
    expect(page.status).toBe(200);
    expect(page.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(page.headers.get("content-security-policy")).toContain("sandbox");
    expect((await request((body.url ?? "").replace(/page\.html$/, "secret.png"))).status).toBe(404);
  });

  it("hands back the same URL for the same file", async () => {
    const first = await grant(path.join(outside, "clip.mp4"));
    const second = await grant(path.join(outside, "clip.mp4"));
    expect(second.body.url).toBe(first.body.url);
  });

  it("says a missing file is missing, apart from the refusals", async () => {
    expect(await grant(path.join(outside, "gone.mp4"))).toEqual({ status: 404, body: { error: "file not found" } });
    expect((await grant("clip.mp4")).status).toBe(400);
    expect((await grant("")).status).toBe(400);
    expect((await grant(path.join(outside, "dir.mp4"))).status).toBe(400);
    expect((await grant(path.join(outside, "notes.txt"))).status).toBe(415);
  });
});
