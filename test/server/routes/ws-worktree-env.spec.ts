// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PtyEntry } from "../../../server/session/types.js";

const ensureWorktreeEnv = vi.fn(() => Promise.resolve({ PORT: "3010" }));
vi.mock("../../../server/config/worktree-env.js", () => ({ ensureWorktreeEnv }));

const { reserveWorktreeEnvForSpawn } = await import("../../../server/routes/ws-routes.js");

const livePty = { cwd: "/repo/worktrees/fix-login" } as unknown as PtyEntry;

beforeEach(() => ensureWorktreeEnv.mockClear());

// A reattach starts no process, so nothing would read a reservation — and its `?cwd=` is the
// least trustworthy field in the request: absent, it falls back to the default workspace. So
// reserving there would hand a port to a directory nobody is launching in. (Codex review, #1367.)
describe("reserveWorktreeEnvForSpawn", () => {
  it("reserves for a connection that is about to spawn", async () => {
    await reserveWorktreeEnvForSpawn("/repo/worktrees/fix-login", undefined);
    expect(ensureWorktreeEnv).toHaveBeenCalledWith("/repo/worktrees/fix-login");
  });

  it("reserves nothing when a live pty is being reattached", async () => {
    await reserveWorktreeEnvForSpawn("/some/workspace/fallback", livePty);
    expect(ensureWorktreeEnv).not.toHaveBeenCalled();
  });
});
