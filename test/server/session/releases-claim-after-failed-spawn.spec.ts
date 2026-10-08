// @vitest-environment node
// After a spawn throws: is this session's all-tools claim released? (#2848) The decision, every
// input; then the helper that every claiming spawner goes through, with the registry stubbed.
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { FullGuiClaimRequest } from "../../../server/session/spawn/spawn-with-full-gui-claim.js";

const registry = vi.hoisted(() => {
  const calls: string[] = [];
  return { carries: true, calls };
});

vi.mock("../../../server/session/registry.js", () => ({
  claimFullGuiMcp: (id: string, attach: boolean, cwd: string | undefined, wouldReattach: boolean, agent: string) => {
    registry.calls.push(`claim ${id} ${attach} ${cwd} ${wouldReattach} ${agent}`);
    return registry.carries;
  },
  releaseAllToolsSession: (id: string) => registry.calls.push(`release ${id}`),
}));

const { releasesClaimAfterFailedSpawn } = await import("../../../server/session/spawn/failed-spawn-claim.js");
const { spawnWithFullGuiClaim } = await import("../../../server/session/spawn/spawn-with-full-gui-claim.js");

const BOOLEANS: readonly boolean[] = [true, false];
const ID = "11111111-2222-4333-8444-555555555555";

describe("releasesClaimAfterFailedSpawn", () => {
  it("releases a claim this fresh spawn recorded", () => {
    expect(releasesClaimAfterFailedSpawn({ carriesFullGuiMcp: true, wouldReattach: false })).toBe(true);
  });

  it("keeps a reattach's claim: the surviving process still runs with its url", () => {
    expect(releasesClaimAfterFailedSpawn({ carriesFullGuiMcp: true, wouldReattach: true })).toBe(false);
  });

  it("has nothing to release when the spawn carried no full GUI MCP", () => {
    BOOLEANS.forEach((wouldReattach) => expect(releasesClaimAfterFailedSpawn({ carriesFullGuiMcp: false, wouldReattach })).toBe(false));
  });

  it("is true for exactly one of the four inputs", () => {
    const released = BOOLEANS.flatMap((carriesFullGuiMcp) =>
      BOOLEANS.filter((wouldReattach) => releasesClaimAfterFailedSpawn({ carriesFullGuiMcp, wouldReattach })).map((wouldReattach) => ({
        carriesFullGuiMcp,
        wouldReattach,
      })),
    );
    expect(released).toEqual([{ carriesFullGuiMcp: true, wouldReattach: false }]);
  });
});

describe("spawnWithFullGuiClaim", () => {
  beforeEach(() => {
    registry.carries = true;
    registry.calls.length = 0;
  });

  const request = (wouldReattach: boolean): FullGuiClaimRequest => ({ sessionId: ID, attachGuiMcp: true, cwd: "/w", wouldReattach, agent: "codex" });

  it("claims before spawning, hands the answer over, and returns the spawn's result untouched", () => {
    BOOLEANS.forEach((carries) => {
      registry.carries = carries;
      registry.calls.length = 0;
      const result = { started: true };
      const seen: boolean[] = [];
      const returned = spawnWithFullGuiClaim(request(false), (allTools) => {
        registry.calls.push("spawn");
        seen.push(allTools);
        return result;
      });
      expect(returned).toBe(result);
      expect(seen).toEqual([carries]);
      expect(registry.calls).toEqual([`claim ${ID} true /w false codex`, "spawn"]);
    });
  });

  it("releases after a fresh spawn throws, and rethrows the very same error", () => {
    const failure = new Error("no tmux");
    expect(() =>
      spawnWithFullGuiClaim(request(false), () => {
        throw failure;
      }),
    ).toThrow(failure);
    expect(registry.calls).toEqual([`claim ${ID} true /w false codex`, `release ${ID}`]);
  });

  it("does not release after a reattach throws", () => {
    expect(() =>
      spawnWithFullGuiClaim(request(true), () => {
        throw new Error("no tmux");
      }),
    ).toThrow("no tmux");
    expect(registry.calls).toEqual([`claim ${ID} true /w true codex`]);
  });

  it("rethrows a non-Error throw unchanged", () => {
    const thrown = { reason: "not an Error" };
    let caught: unknown = null;
    try {
      spawnWithFullGuiClaim(request(false), () => {
        throw thrown;
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBe(thrown);
  });
});
