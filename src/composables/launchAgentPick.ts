// The value a launch control's Agent Picker holds, and the ONE way to seed it from the configured
// default (#2082).
//
// Sampling `defaultAgent()` into a ref yourself is wrong in a way nothing catches. The setting
// arrives over HTTP, so whether a sample taken at setup is right depends on whether that request
// happened to finish first — which no test, reviewer or type sees. It was wrong at three separate
// controls in this change's review, each found and fixed on its own: the chat launcher, the in-grid
// cell, and the launch panel. So the rule is no longer "remember to watch". Following the late
// arrival is what this does, rather than what each caller has to remember.
//
// It follows the setting until the control is COMMITTED — the user chose, or the cell launched —
// because a late config must never move a decision someone already made.
import { ref, watch, type Ref } from "vue";
import { defaultAgent, defaultAgentRef } from "./defaultAgent";
import type { AgentPick } from "../../common/customAgents";

export interface LaunchAgentPick {
  /** What the picker shows, and what Start acts on. */
  pick: Ref<AgentPick>;
  /** Record the user's choice. Binding the ref directly would silently skip the commit. */
  choose: (value: AgentPick) => void;
}

export function launchAgentPick(
  options: {
    /** What this control was RESTORED with, or null when there is nothing to restore. Given a
     *  value, the control is reading a stored one and the setting is never consulted — an absent
     *  agent on a stored cell means claude, which is a format and not a preference. */
    restored?: () => AgentPick | null;
    /** True once the value is fixed by something other than the picker, such as a launched cell. */
    committed?: () => boolean;
  } = {},
): LaunchAgentPick {
  const restored = options.restored?.() ?? null;
  const chosen = ref(false);
  const pick = ref<AgentPick>(restored ?? defaultAgent());
  const choose = (value: AgentPick): void => {
    pick.value = value;
    chosen.value = true;
  };
  if (restored === null) {
    watch(defaultAgentRef, () => {
      if (!chosen.value && options.committed?.() !== true) pick.value = defaultAgent();
    });
  }
  return { pick, choose };
}
