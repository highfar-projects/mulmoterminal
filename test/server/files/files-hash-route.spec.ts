// @vitest-environment node
//
// GET /api/files/browse/sha256 (fork-only): the Files tree's "Get SHA-256 hash". The digest of the
// file's bytes as they are on disk, under the same containment as the text route.
import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import express from "express";
import { makeTempDir } from "../../support/tempDir.js";
import { routeCall } from "../../helpers/routeCall";
import { mountFilesBrowseRoutes } from "../../../server/files/files-browse";

const query = (dir: string, file: string) => `cwd=${encodeURIComponent(dir)}&path=${encodeURIComponent(file)}`;

function project() {
  const dir = makeTempDir("mt-hash-");
  const app = express();
  mountFilesBrowseRoutes(app, { defaultCwd: dir, backupRoot: path.join(dir, ".backups") });
  return { dir, hash: (file: string) => routeCall(app)(`/api/files/browse/sha256?${query(dir, file)}`) };
}

describe("GET /api/files/browse/sha256", () => {
  it("answers the SHA-256 of the file's bytes and how many there were", async () => {
    const { dir, hash } = project();
    writeFileSync(path.join(dir, "a.txt"), "hello\n");
    const res = await hash("a.txt");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ sha256: "5891b5b522d5df086d0ff0b110fbd9d21bb4fc7163af34d08286a2e846f6be03", size: 6 });
  });

  // Not decoded on the way: a binary file and a BOM are hashed as they are, as `sha256sum` would.
  it("hashes the raw bytes of a binary file, larger than one read", async () => {
    const { dir, hash } = project();
    const bytes = Buffer.alloc(3 * 1024 * 1024 + 17, 0);
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = (i * 31) % 256;
    writeFileSync(path.join(dir, "blob.bin"), bytes);
    const res = await hash("blob.bin");
    expect(res.body).toEqual({ sha256: createHash("sha256").update(bytes).digest("hex"), size: bytes.length });
  });

  it("answers the well-known digest for an empty file", async () => {
    const { dir, hash } = project();
    writeFileSync(path.join(dir, "empty"), "");
    expect((await hash("empty")).body).toEqual({ sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", size: 0 });
  });

  it("refuses a folder", async () => {
    const { dir, hash } = project();
    mkdirSync(path.join(dir, "sub"));
    const res = await hash("sub");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("not a file");
  });

  it("answers 404 for a file that is not there", async () => {
    const { hash } = project();
    expect((await hash("missing.txt")).status).toBe(404);
  });

  it("refuses a path that climbs out of the project", async () => {
    const { dir, hash } = project();
    writeFileSync(path.join(path.dirname(dir), `outside-${path.basename(dir)}.txt`), "secret");
    const res = await hash(`../outside-${path.basename(dir)}.txt`);
    expect(res.status).toBe(403);
    expect(res.body.sha256).toBeUndefined();
  });
});
