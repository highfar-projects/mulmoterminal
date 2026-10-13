import { describe, it, expect, vi, beforeEach } from "vitest";
import { defineComponent, ref } from "vue";
import { mount } from "@vue/test-utils";

// #3022. With nothing enlarged, the cell an agent's pane command is for is enlarged; with a cell
// enlarged, or away from the terminals, nothing moves.
const bus = vi.hoisted(() => new Set<(data: unknown) => void>());
vi.mock("../../../src/composables/usePubSub", () => ({
  usePubSub: () => ({
    subscribe: (_channel: string, cb: (data: unknown) => void) => {
      bus.add(cb);
      return () => bus.delete(cb);
    },
  }),
}));
const { useRevealOnPaneCommand } = await import("../../../src/composables/useRevealOnPaneCommand");
const publish = (data: unknown) => [...bus].forEach((cb) => cb(data));
const command = (sessionId: string) => ({ kind: "show", sessionId, cwd: "/w", path: "a.md", view: "editor" });

function harness(expanded: number | null, onTerminals = true) {
  const enlarge = vi.fn();
  const expandedUid = ref<number | null>(expanded);
  mount(
    defineComponent({
      setup() {
        useRevealOnPaneCommand({ expandedUid, uidOfSession: (id) => (id === "s2" ? 2 : undefined), onTerminalsRoute: () => onTerminals, enlarge });
        return () => null;
      },
    }),
  );
  return enlarge;
}

describe("useRevealOnPaneCommand", () => {
  beforeEach(() => bus.clear());
  it("enlarges the asking cell when nothing is enlarged", () => {
    const enlarge = harness(null);
    publish(command("s2"));
    expect(enlarge).toHaveBeenCalledWith(2);
  });
  it.each([
    ["a cell is enlarged", 1, true, "s2"],
    ["away from the terminals", null, false, "s2"],
    ["the session has no cell", null, true, "gone"],
  ])("leaves the screen alone when %s", (_case, expanded, onTerminals, session) => {
    const enlarge = harness(expanded, onTerminals);
    publish(command(session));
    publish({ kind: "noise" });
    expect(enlarge).not.toHaveBeenCalled();
  });
});
