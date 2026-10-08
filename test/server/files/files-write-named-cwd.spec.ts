// @vitest-environment node
//
// A named cwd that is gone must not fall back to the default workspace for a WRITE: the file would
// land in another folder, or a same-named file there would read as "someone made it first" (#2676).
import { describe, it, expect } from "vitest";
import { makeTempDir } from "../../support/tempDir.js";
import { writeFileSync, rmSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import express from "express";
import { routeCall, jsonPost } from "../../helpers/routeCall";
import { mountFilesBrowseRoutes } from "../../../server/files/files-browse";

async function withProject(run: (app: express.Express, dir: string) => Promise<void>) {
  const dir = makeTempDir("mt-files-named-");
  writeFileSync(path.join(dir, "a.md"), "one");
  const app = express();
  app.use(express.json());
  mountFilesBrowseRoutes(app, { defaultCwd: dir, backupRoot: path.join(dir, ".backups") });
  try {
    await run(app, dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const put = (app: express.Express, url: string, body: unknown) => routeCall(app)(url, { ...jsonPost(body), method: "PUT" });

describe("writes under a named cwd", () => {
  it("refuses a write and a backup under a cwd that no longer exists, leaving the default untouched", async () => {
    await withProject(async (app, dir) => {
      const gone = encodeURIComponent(path.join(dir, "removed-project"));
      expect((await put(app, `/api/files/browse/write?cwd=${gone}&path=a.md`, { text: "elsewhere", baseVersion: null })).status).toBe(404);
      expect((await put(app, `/api/files/browse/backup?cwd=${gone}&path=a.md`, { text: "x" })).status).toBe(404);
      expect(readFileSync(path.join(dir, "a.md"), "utf8")).toBe("one");
      expect(existsSync(path.join(dir, "removed-project"))).toBe(false);
    });
  });

  it("still writes to the default workspace when no cwd is named", async () => {
    await withProject(async (app, dir) => {
      expect((await put(app, "/api/files/browse/write?path=new.md", { text: "here", baseVersion: null })).status).toBe(200);
      expect(readFileSync(path.join(dir, "new.md"), "utf8")).toBe("here");
    });
  });
});
