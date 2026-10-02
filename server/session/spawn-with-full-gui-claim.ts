// The claim-then-spawn sequence every agent that can carry the whole GUI MCP goes through, so a
// spawn that throws takes its claim with it — the same guarantee withSettingsCleanup gives the
// session's files (#2848).
import type { SessionAgent } from "../../common/sessionAgent.js";
import { claimFullGuiMcp, releaseAllToolsSession } from "./registry.js";
import { releasesClaimAfterFailedSpawn } from "./failed-spawn-claim.js";

export interface FullGuiClaimRequest {
  sessionId: string;
  attachGuiMcp: boolean;
  cwd: string | undefined;
  /** The caller's own reattach probe, taken once and shared — see spawn-claude.ts. */
  wouldReattach: boolean;
  agent: SessionAgent;
}

/** Claim, then run `spawn` with the answer. A throw releases the claim (fresh spawns only) and is
 *  rethrown unchanged. */
export function spawnWithFullGuiClaim<T>(request: FullGuiClaimRequest, spawn: (carriesFullGuiMcp: boolean) => T): T {
  const { sessionId, attachGuiMcp, cwd, wouldReattach, agent } = request;
  const carriesFullGuiMcp = claimFullGuiMcp(sessionId, attachGuiMcp, cwd, wouldReattach, agent);
  try {
    return spawn(carriesFullGuiMcp);
  } catch (e) {
    if (releasesClaimAfterFailedSpawn({ carriesFullGuiMcp, wouldReattach })) releaseAllToolsSession(sessionId);
    throw e;
  }
}
