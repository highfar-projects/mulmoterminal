// @vitest-environment node
// The json route as the Files pane's Preview uses it (#3137). Its own file: files-browse.spec.ts is at
// the line limit.
import { describe, it, expect } from "vitest";
import { makeTempDir } from "../../support/tempDir.js";
import { writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import express from "express";
import { routeCall } from "../../helpers/routeCall";
import { mountFilesBrowseRoutes } from "../../../server/files/files-browse";

const tmp = () => makeTempDir("mt-files-json-");

const serveProject = (dir: string) => {
  const app = express();
  mountFilesBrowseRoutes(app, { defaultCwd: dir, backupRoot: path.join(dir, ".backups") });
  return app;
};

describe("GET /api/files/browse/json — the app's theme", () => {
  const THEME = "bg=%231a1a2e&fg=%23e6e6f0&muted=%23a0a0b8&subtle=%23232342&border=%2333335a&link=%234a8cff";
  const serve = async (extra: string) => {
    const dir = tmp();
    writeFileSync(path.join(dir, "a.json"), '{"a":1}');
    try {
      return await routeCall(serveProject(dir))(`/api/files/browse/json?cwd=${encodeURIComponent(dir)}&path=a.json${extra}`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };

  it("paints the indented JSON in the theme it was given, still under the sandbox", async () => {
    const res = await serve(`&${THEME}`);
    expect(res.text).toContain("background:#1a1a2e");
    expect(res.text).toContain("{\n  &quot;a&quot;: 1\n}");
    expect(res.headers["content-security-policy"]).toBe("sandbox");
  });

  it("leaves JSON with no theme on the system colours", async () => {
    expect((await serve("")).text).not.toContain("background:#1a1a2e");
  });
});
