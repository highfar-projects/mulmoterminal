// @vitest-environment node
// The Mulmo menu's listing route (#1948). What it answers IS the allowlist of what that menu can
// name back, so the two things worth pinning are that it lists the right directory's decks and
// that it refuses a directory it cannot use rather than substituting the default workspace —
// which is #1151's rule, and the reason a menu can be trusted to name a file at all.
import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import express from "express";
import { routeCall } from "../../helpers/routeCall";
import { mountDirRoutes } from "../../../server/routes/dir-routes";

const app = express();
app.use(express.json());
mountDirRoutes(app);
const call = routeCall(app);

const deck = (title: string) => JSON.stringify({ $mulmocast: { version: "1.1" }, title, beats: [{ text: "a" }] });

const withTempDir = async (run: (dir: string) => Promise<void>) => {
  const dir = mkdtempSync(path.join(tmpdir(), "mt-deckroute-"));
  try {
    await run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

describe("GET /api/mulmo/decks", () => {
  it("lists the decks under the directory it was asked about, and says which that was", async () => {
    await withTempDir(async (dir) => {
      mkdirSync(path.join(dir, "decks"));
      writeFileSync(path.join(dir, "decks", "talk.json"), deck("Launch talk"));
      writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "x" }));
      const res = await call(`/api/mulmo/decks?${new URLSearchParams({ cwd: dir })}`);
      expect(res.status).toBe(200);
      expect(res.body.decks).toEqual([{ path: path.join("decks", "talk.json"), label: "Launch talk" }]);
      // The cell joins the relative path back against this, so an answer about a different
      // directory would name a file the user never saw (#1151).
      expect(res.body.cwd).toBe(dir);
    });
  });

  it("answers an empty list for a directory holding no deck", async () => {
    await withTempDir(async (dir) => {
      writeFileSync(path.join(dir, "tsconfig.json"), JSON.stringify({ compilerOptions: {} }));
      const res = await call(`/api/mulmo/decks?${new URLSearchParams({ cwd: dir })}`);
      expect(res.status).toBe(200);
      expect(res.body.decks).toEqual([]);
    });
  });

  // The whole point of the 404: no `decks`. The body still echoes the requested `cwd` — measured,
  // and it is `workspaceForRoute`'s shared shape, which names the directory that could not be used
  // rather than reporting about a different one (#1151).
  it("refuses a directory that does not exist rather than answering about the default workspace", async () => {
    await withTempDir(async (dir) => {
      const gone = path.join(dir, "deleted-project");
      const res = await call(`/api/mulmo/decks?${new URLSearchParams({ cwd: gone })}`);
      expect(res.status).toBe(404);
      expect(res.body.decks).toBeUndefined();
      expect(res.body.cwd).toBe(gone);
      expect(res.body.error).toContain("no longer exists");
    });
  });
});
