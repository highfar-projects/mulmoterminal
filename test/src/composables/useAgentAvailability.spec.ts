// The two readings of GET /api/agents/availability. `unavailableAgents` assumes the best (a picker
// that fails one spawn is fine); `confirmedAgents` assumes nothing (the default-agent control, where
// a wrong guess stops the next launch).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { flushPromises } from "@vue/test-utils";
import { resetAgentAvailability, useAgentAvailability } from "../../../src/composables/useAgentAvailability";

let answer: () => Promise<unknown>;

beforeEach(() => {
  resetAgentAvailability();
  globalThis.fetch = vi.fn(async () => ({ ok: true, json: answer })) as unknown as typeof fetch;
});

describe("useAgentAvailability", () => {
  it("confirms only the agents the server said it can start", async () => {
    answer = async () => ({
      agents: [
        { agent: "claude", available: true },
        { agent: "codex", available: false, reason: "missing", installGuide: null },
        { agent: "grok", available: true },
        { agent: "muse", available: "yes" },
      ],
    });
    const { unavailableAgents, confirmedAgents } = useAgentAvailability();
    await flushPromises();
    expect([...confirmedAgents.value].sort()).toEqual(["claude", "grok"]);
    expect([...unavailableAgents.value.keys()]).toEqual(["codex"]);
  });

  it("confirms nothing before the answer arrives", () => {
    answer = () => new Promise(() => {});
    const { confirmedAgents, unavailableAgents } = useAgentAvailability();
    expect(confirmedAgents.value.size).toBe(0);
    expect(unavailableAgents.value.size).toBe(0);
  });

  it("confirms nothing when the answer is not a list, or the request throws", async () => {
    answer = async () => ({ error: "nope" });
    expect(useAgentAvailability().confirmedAgents.value.size).toBe(0);
    await flushPromises();
    expect(useAgentAvailability().confirmedAgents.value.size).toBe(0);
    resetAgentAvailability();
    globalThis.fetch = vi.fn(async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    const { confirmedAgents } = useAgentAvailability();
    await flushPromises();
    expect(confirmedAgents.value.size).toBe(0);
  });
});
