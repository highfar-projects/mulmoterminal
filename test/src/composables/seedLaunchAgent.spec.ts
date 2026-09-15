// The race between /api/config landing and the user touching the Agent Picker (#2082).
//
// `seedLaunchAgentFromConfig` promises that a remembered choice outranks the configured default.
// It did not: the "has this browser ever chosen?" answer was captured at MODULE LOAD, and the
// config arrives over HTTP long afterwards. A user who opened the picker in that gap had their
// choice overwritten — the opposite of the function's own first sentence (Codex round 5 of #2084).
//
// `vi.resetModules` + a dynamic import per case, because the value under test is module state read
// at import time. That is the case CLAUDE.md names as the exception to importing at module scope.
import { describe, it, expect, beforeEach, vi } from "vitest";

const KEY = "mt-launch-agent";
const freshModule = async () => {
  vi.resetModules();
  return import("../../../src/composables/useChatLauncher");
};

describe("seedLaunchAgentFromConfig", () => {
  beforeEach(() => localStorage.clear());

  it("seeds a browser that has never chosen", async () => {
    const { launchAgent, seedLaunchAgentFromConfig } = await freshModule();
    seedLaunchAgentFromConfig("codex");
    expect(launchAgent.value).toBe("codex");
  });

  it("leaves a remembered choice alone", async () => {
    localStorage.setItem(KEY, "grok");
    const { launchAgent, seedLaunchAgentFromConfig } = await freshModule();
    seedLaunchAgentFromConfig("codex");
    expect(launchAgent.value).toBe("grok");
  });

  // THE RACE. Storage is empty at import — so the stale flag says "never chosen" — and the user
  // picks before the config lands. The watch writes that to localStorage, which is why re-reading
  // is the live answer and the captured one is not.
  it("leaves alone a choice made AFTER load but BEFORE the config arrived", async () => {
    const { launchAgent, seedLaunchAgentFromConfig } = await freshModule();
    expect(localStorage.getItem(KEY)).toBeNull(); // the precondition the bug needed

    launchAgent.value = "muse"; // the user opens the picker while /api/config is in flight
    await vi.waitFor(() => expect(localStorage.getItem(KEY)).toBe("muse"));

    seedLaunchAgentFromConfig("codex"); // ...and only now does the config land
    expect(launchAgent.value, "the user's live choice was overwritten by config hydration").toBe("muse");
  });

  it.each([[null], [undefined], [""], ["clyde"], [5]])("ignores %j rather than seeding nonsense", async (configured) => {
    const { launchAgent, seedLaunchAgentFromConfig } = await freshModule();
    seedLaunchAgentFromConfig(configured);
    expect(launchAgent.value).toBe("claude");
  });
});
