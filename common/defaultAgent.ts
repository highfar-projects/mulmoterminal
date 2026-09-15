// The one place the `defaultAgent` setting is defined (#2082). Both sides decide from it — the
// server sanitizes what the config file says and the launcher gates start-up on it, the browser
// seeds the launch form from it — and a rule that disagreed across the two would show up as a
// picker that opens on one agent while the CLI insisted on another.
//
// ── THE DISTINCTION THIS FILE EXISTS TO HOLD ────────────────────────────────────────────────
// "The default agent" names two different things in this codebase, and only one of them is a
// preference:
//
//   1. What an ABSENT `agent` field means. That is claude, on disk and on the wire
//      (src/components/gridTabs.ts: "Claude is stored as the ABSENCE of the field"), and it is a
//      STORAGE FORMAT. Repointing it here would silently re-launch every saved Claude cell as
//      something else the next time the grid loaded.
//   2. What a NEW session starts as. That is a preference, and it is what this setting is.
//
// So `newSessionAgent` is for the path that CREATES a session. Nothing that restores one may call
// it, and no `?? "claude"` that reads stored data may be replaced by it.
import { isTerminalAgent, type TerminalAgent } from "./sessionAgent.js";

/** What a session starts as when nothing is configured. Also the meaning of an absent `agent` on a
 *  stored cell — the same value for two different reasons, which is why both are spelled out. */
export const FALLBACK_AGENT: TerminalAgent = "claude";

/** Anything that is not a known agent id is "unconfigured", which is what every config file written
 *  before this setting existed contains. A typo therefore reads as claude rather than as a crash —
 *  the launcher reports an unknown name before it ever gets here (bin/default-agent.js). */
export const sanitizeDefaultAgent = (input: unknown): TerminalAgent | null => (typeof input === "string" && isTerminalAgent(input) ? input : null);

/** Which agent a NEW session should start as. Call this where a session is CREATED; never where one
 *  is restored, and never in place of a `?? "claude"` that is reading a stored or wire value. */
export const newSessionAgent = (configured: TerminalAgent | null): TerminalAgent => configured ?? FALLBACK_AGENT;
