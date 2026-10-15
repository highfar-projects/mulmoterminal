// The GUI tool restriction a codex resume inherits from the session that wrote the rollout (#3033).
//
// The launcher lists codex conversations by codex's own rollout id, so an ended restricted worker
// can come back under a key the restriction was never recorded for — and would start with every
// tool. The sessions recorded as holding that rollout say what it was limited to.
import type { ToolGroup } from "../../../../common/toolGroups.js";
import type { AgentConversation } from "../../list/agent-conversations.js";

/** The narrowest restriction among the sessions holding `rolloutId`, or null when none was limited. */
export function inheritedGuiRestriction(
  rolloutId: string,
  conversations: Iterable<AgentConversation>,
  restrictionOf: (sessionId: string) => readonly ToolGroup[] | null,
): readonly ToolGroup[] | null {
  const restrictions = [...conversations]
    .filter((record) => record.conversationId === rolloutId)
    .map((record) => restrictionOf(record.sessionId))
    .filter((groups): groups is readonly ToolGroup[] => groups !== null);
  if (restrictions.length === 0) return null;
  return restrictions.reduce((narrowest, groups) => narrowest.filter((group) => groups.includes(group)));
}
