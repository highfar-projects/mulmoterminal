// @vitest-environment node
// #2164 review (Codex P2). The forced post-turn refresh must reach `gitStatus` as a FRESH read.
// Without the query param reaching the call, the route silently joins whatever poll is in
// flight and answers about the tree as it was before the turn wrote to it.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import express from "express";

const gitStatusMock = vi.fn(async () => ({ repo: true, branch: "main", detached: false, dirty: 0, ahead: 0, behind: 0, upstream: true }));
vi.mock("../../../server/git/git-status.js", () => ({
  gitStatus: (...args: unknown[]) => gitStatusMock(...(args as [])),
}));

const { routeCall } = await import("../../helpers/routeCall");
const { mountDirRoutes } = await import("../../../server/routes/dir-routes");

const app = express();
app.use(express.json());
mountDirRoutes(app);
const call = routeCall(app);

const withTempDir = async (run: (dir: string) => Promise<void>) => {
  const dir = mkdtempSync(path.join(tmpdir(), "mt-freshroute-"));
  try {
    await run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

describe("/api/git-status — the fresh flag reaches gitStatus", () => {
  beforeEach(() => gitStatusMock.mockClear());

  it("asks for a fresh read when fresh=1", async () => {
    await withTempDir(async (dir) => {
      await call(`/api/git-status?${new URLSearchParams({ cwd: dir, fresh: "1" })}`);
      expect(gitStatusMock).toHaveBeenCalledWith(dir, { fresh: true });
    });
  });

  it("does not when the parameter is absent", async () => {
    await withTempDir(async (dir) => {
      await call(`/api/git-status?${new URLSearchParams({ cwd: dir })}`);
      expect(gitStatusMock).toHaveBeenCalledWith(dir, { fresh: false });
    });
  });

  // Anything other than the exact flag is a poll, not a forced read — a truthy-string check
  // would make `fresh=0` force one.
  it("treats any other value as not fresh", async () => {
    await withTempDir(async (dir) => {
      await call(`/api/git-status?${new URLSearchParams({ cwd: dir, fresh: "0" })}`);
      expect(gitStatusMock).toHaveBeenCalledWith(dir, { fresh: false });
      await call(`/api/git-status?${new URLSearchParams({ cwd: dir, fresh: "true" })}`);
      expect(gitStatusMock).toHaveBeenLastCalledWith(dir, { fresh: false });
    });
  });
});
