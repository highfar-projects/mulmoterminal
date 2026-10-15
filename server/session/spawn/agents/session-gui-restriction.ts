// The GUI tool groups a spawned session is limited to (#3033), shared by every agent that takes its
// GUI MCP per spawn (claude, codex, copilot).
import type { ToolGroup } from "../../../../common/toolGroups.js";
import { codexRollouts, guiGroupRestriction, rememberGuiGroupRestriction } from "../../registry.js";
import { inheritedGuiRestriction } from "./inherited-gui-restriction.js";

/** The groups this session is limited to, or null. Recorded before anything can connect, and read
 *  back on EVERY spawn of the id: a resume arrives as a plain reconnect, and only this record says
 *  the session was limited. */
export function sessionGuiRestriction(sessionId: string, guiGroups: readonly ToolGroup[] | undefined): readonly ToolGroup[] | null {
  if (guiGroups) rememberGuiGroupRestriction(sessionId, guiGroups);
  return guiGroupRestriction(sessionId);
}

/** codex's, which also covers a resume under the rollout id: that key was never recorded, so the
 *  restriction of the sessions holding the rollout is recorded under it before the spawn. */
export function codexSessionGuiRestriction(
  sessionId: string,
  guiGroups: readonly ToolGroup[] | undefined,
  resumeRolloutId: string | null,
): readonly ToolGroup[] | null {
  const unrecorded = !guiGroups && resumeRolloutId !== null && guiGroupRestriction(sessionId) === null;
  const inherited = unrecorded ? inheritedGuiRestriction(resumeRolloutId, codexRollouts.values(), guiGroupRestriction) : null;
  return sessionGuiRestriction(sessionId, guiGroups ?? inherited ?? undefined);
}
