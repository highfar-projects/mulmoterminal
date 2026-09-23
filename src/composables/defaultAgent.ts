// The configured default agent (#2082), hydrated from /api/config.
//
// It answers ONE question: what should a NEW session start as. It is deliberately not consulted
// anywhere that restores a session — on disk and on the wire an absent `agent` means claude
// (src/components/gridTabs.ts), which is a storage format, and reading it from here instead would
// re-launch every saved Claude cell as whatever this says.
//
// Arrives AFTER the module graph loads, because it comes over HTTP, so the launch controls read the
// ref rather than capturing its value.
import { ref } from "vue";
import { FALLBACK_AGENT, newSessionAgent, sanitizeDefaultAgent } from "../../common/defaultAgent";
import type { TerminalAgent } from "../../common/sessionAgent";

const configured = ref<TerminalAgent | null>(null);

/** What a new session starts as: the configured default, or claude. */
export const defaultAgent = () => newSessionAgent(configured.value);

/** The reactive form, for controls that have to re-render when the config lands. */
export const defaultAgentRef = configured;

/** Hydrate from /api/config. The payload is `Record<string, unknown>` on this side, so the value is
 *  RE-VALIDATED here rather than trusted — an older or newer server is exactly the case that sends
 *  something else, and the same rule the server applies to the file applies to the wire. */
export const setDefaultAgent = (agent: unknown): void => {
  configured.value = sanitizeDefaultAgent(agent);
};

export { FALLBACK_AGENT };
