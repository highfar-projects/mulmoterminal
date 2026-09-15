// Which cells open their Agent Picker on the CONFIGURED DEFAULT, and which read a storage format.
//
// This is the whole of the storage-vs-preference boundary (#2082) at the one place it is easy to
// get backwards. An absent `agent` on a stored cell means claude and always will
// (src/components/gridTabs.ts) — so a cell being RESTORED must never consult the default-agent
// setting, or every saved Claude cell relaunches as whatever that setting happens to say.
//
// A cell with no session has nothing to restore. Its picker is choosing what to START, which is
// the only question the setting answers — and it is the first thing a new user sees, because an
// otherwise empty grid is given exactly one of these (`ensureEntry`).
import { isCustomAgentId } from "../../common/customAgents";
import type { TerminalAgent } from "../../common/sessionAgent";

/** What a cell was restored with: its session, the agent stored against it, and the custom-agent
 *  wrapper it was launched from. Each is absent for a cell that has never run. */
export interface RestoredCell {
  sessionId: string | null;
  agent?: TerminalAgent | null | undefined;
  customAgent?: string | null | undefined;
  /** The cell was told to start on mount rather than to wait on the launcher form. */
  autoStart?: boolean | undefined;
}

/** True when the cell has nothing to restore, so its picker should open on the configured default
 *  rather than on the absent-means-claude storage rule. A stored agent or a wrapper wins over the
 *  setting even with no session: that cell already says what it runs.
 *
 *  So does `autoStart`, and that one is the trap. An explicit "launch Claude here" from the phone
 *  or the launch panel is `{ session: null, autoStart: true }` with NO agent field, because claude
 *  is the absent case there too (src/components/launchCell.ts) — so without this clause a request
 *  naming claude would open on the configured default AND immediately start it. */
export const opensOnConfiguredDefault = ({ sessionId, agent, customAgent, autoStart }: RestoredCell): boolean =>
  sessionId === null && agent == null && autoStart !== true && !isCustomAgentId(customAgent);
