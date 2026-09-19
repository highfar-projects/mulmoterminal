// The coalescing window, forced deterministically. The repo-backed specs next door exercise the
// real thing but cannot CHOOSE the interleaving, so the one interleaving that matters — a caller
// arriving while another is still resolving its key — is only ever hit by luck there, which is how
// it reached CI as a flake instead of as a test (#2196).
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// Deferred PER CALL, so a test decides exactly when each caller learns its key.
const pendingTopLevel: Array<{ dir: string; resolve: (v: string | null) => void }> = [];
const gitTopLevel = vi.fn(
  (dir: string) =>
    new Promise<string | null>((resolve) => {
      pendingTopLevel.push({ dir, resolve });
    }),
);
const dirtyCount = vi.fn(async () => 0);

vi.mock("../../../server/git/worktrees.js", () => ({
  gitTopLevel: (dir: string) => gitTopLevel(dir),
  git: async () => ({ ok: true, stdout: "main", stderr: "", code: 0 }),
}));
vi.mock("../../../server/git/dirty-count.js", () => ({ dirtyCount: () => dirtyCount() }));

const { gitStatus } = await import("../../../server/git/git-status.js");

// One read is three git processes behind a `Promise.all`, so "everything that can progress has"
// takes more than a single microtask turn. Drained either side of a macrotask so a read that has
// started is allowed to FINISH — which is the state the window depends on.
const settle = async (): Promise<void> => {
  for (let i = 0; i < 40; i += 1) await Promise.resolve();
  await new Promise((resolve) => setImmediate(resolve));
  for (let i = 0; i < 40; i += 1) await Promise.resolve();
};

describe("gitStatus coalescing while the key is still resolving", () => {
  beforeEach(() => {
    pendingTopLevel.length = 0;
    dirtyCount.mockClear();
    gitTopLevel.mockClear();
  });

  // The interleaving that defeated coalescing: both callers are mid-`rev-parse` and neither is
  // registered, so the second cannot see the first. Letting the first one's whole read finish
  // before the second learns its key is what used to buy a second full read.
  it("joins a caller whose read already finished while this one was still resolving its key", async () => {
    const first = gitStatus("/repo");
    const second = gitStatus("/repo");
    await settle();
    pendingTopLevel[0]?.resolve("/repo");
    await settle();
    pendingTopLevel[1]?.resolve("/repo");
    await settle();

    const [firstStatus, secondStatus] = await Promise.all([first, second]);
    expect(dirtyCount).toHaveBeenCalledTimes(1);
    expect(firstStatus).toBe(secondStatus);
  });

  // The key lookup is coalesced too, so the cheap process is not paid per caller either.
  it("resolves the worktree root once for callers sharing a cwd", async () => {
    const first = gitStatus("/repo");
    const second = gitStatus("/repo");
    await settle();
    pendingTopLevel[0]?.resolve("/repo");
    await settle();
    await Promise.all([first, second]);
    expect(gitTopLevel).toHaveBeenCalledTimes(1);
  });

  // The honest boundary. Two DIFFERENT cwds of one worktree cannot be joined before `rev-parse`
  // answers, because the cwd is the only thing that identifies a caller until then — so this pair
  // still runs two reads, and no assertion here may claim otherwise. Closing it would need a
  // remembered cwd-to-root mapping, which is a correctness decision rather than a tidy-up: the
  // read is keyed by root but RUN with the first registrant's cwd, so a stale mapping would serve
  // one worktree's status for another.
  it("does not pretend to join two different cwds that are still resolving", async () => {
    const fromRoot = gitStatus("/repo");
    const fromSub = gitStatus("/repo/sub");
    await settle();
    pendingTopLevel[0]?.resolve("/repo");
    await settle();
    pendingTopLevel[1]?.resolve("/repo");
    await settle();

    await Promise.all([fromRoot, fromSub]);
    expect(dirtyCount).toHaveBeenCalledTimes(2);
  });
});
