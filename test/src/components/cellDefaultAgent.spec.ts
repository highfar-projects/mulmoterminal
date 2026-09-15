// The cell's Agent Picker opens on the configured default (#2082) — and the rule being right in
// cellLaunchAgent.ts is not the same as the cell OBEYING it, which is what this file pins.
//
// The entry cell an otherwise empty grid is given (`ensureEntry`) is the first launcher a new user
// meets, and it was still opening on Claude while the launch PANEL had been fixed — so on a machine
// with codex declared and no claude installed, the primary Start button started something absent
// (Codex round 8 of #2084).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import TerminalCell from "../../../src/components/TerminalCell.vue";
import { setDefaultAgent } from "../../../src/composables/defaultAgent";
import type { TerminalAgent } from "../../../common/sessionAgent";

vi.mock("../../../src/composables/usePubSub", () => ({
  usePubSub: () => ({ subscribe: () => () => {}, onReconnect: () => () => {} }),
}));

vi.mock("../../../src/components/Terminal.vue", () => ({
  default: { name: "TerminalView", props: ["sessionId", "connectKey", "cwd", "hideHeader", "agent"], template: '<div class="stub-term" />' },
}));

const SESSION = "44444444-4444-4444-4444-444444444444";

beforeEach(() => {
  globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ working: false, waiting: false, lastPrompt: null }) })) as unknown as typeof fetch;
});
// Module state, so a leak would silently seed the next file's cells.
afterEach(() => setDefaultAgent(null));

type CellProps = { initialSessionId?: string | null; initialAgent?: TerminalAgent | null; initialCustomAgent?: string | null };

const mountCell = (props: CellProps = {}) =>
  mount(TerminalCell, {
    props: {
      uid: 1,
      expanded: false,
      zoomed: false,
      initialSessionId: null,
      initialCwd: null,
      defaultCwd: "/home/me/my-project",
      presets: [],
      home: "/home/me",
      cancellable: false,
      openSessionIds: [],
      openCwds: [],
      ...props,
    },
  });

/** What the launch form was handed — the picker's value, which is what Start acts on. */
const pickerAgent = (w: ReturnType<typeof mount>) => w.findComponent({ name: "CellLaunchForm" }).props("agent");
/** What a RESTORED cell connects as. A cell with a session shows the terminal and no form at all,
 *  so this is where its agent is observable — and it is the value that picks the WS endpoint. */
const connectedAgent = (w: ReturnType<typeof mount>) => w.findComponent({ name: "TerminalView" }).props("agent");

describe("a cell's Agent Picker and the configured default", () => {
  it("opens the entry cell on the declared default", async () => {
    setDefaultAgent("codex");
    const w = mountCell();
    await flushPromises();
    expect(pickerAgent(w)).toBe("codex");
  });

  // The config arrives over HTTP and the entry cell mounts first, so a value that only applied at
  // construction would never be seen on the one cell that matters most.
  it("applies a default that lands AFTER the cell mounted", async () => {
    const w = mountCell();
    await flushPromises();
    expect(pickerAgent(w)).toBe("claude");
    setDefaultAgent("codex");
    await flushPromises();
    expect(pickerAgent(w)).toBe("codex");
  });

  // A late config must not overwrite a choice the user already made in the gap.
  it("does not overwrite a pick the user made before the config landed", async () => {
    const w = mountCell();
    await flushPromises();
    w.findComponent({ name: "CellLaunchForm" }).vm.$emit("update:agent", "grok");
    await flushPromises();
    setDefaultAgent("codex");
    await flushPromises();
    expect(pickerAgent(w)).toBe("grok");
  });

  // THE REGRESSION THIS MUST NOT CAUSE. An absent agent on a cell with a session is the storage
  // format saying claude; a restored cell must reconnect as claude however the default is set.
  it("leaves a restored session alone, where an absent agent means claude", async () => {
    setDefaultAgent("codex");
    const w = mountCell({ initialSessionId: SESSION });
    await flushPromises();
    expect(connectedAgent(w)).toBe("claude");
  });

  // A cell that stores its agent already answered, session or not.
  it("leaves a stored agent alone", async () => {
    setDefaultAgent("codex");
    const w = mountCell({ initialAgent: "grok" });
    await flushPromises();
    expect(pickerAgent(w)).toBe("grok");
  });

  // Without a declared default nothing changes: claude is still what an empty cell opens on.
  it("opens on claude when nothing is declared", async () => {
    const w = mountCell();
    await flushPromises();
    expect(pickerAgent(w)).toBe("claude");
  });
});
