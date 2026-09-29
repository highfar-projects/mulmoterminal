import { describe, it, expect, vi, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";

// Talking to another terminal is a row in the Tools menu, not a header button of its own (#2421).
// The row is there only when another terminal is, and picking it opens the same panel.

vi.mock("../../../src/composables/usePubSub", () => ({
  usePubSub: () => ({ subscribe: () => () => {}, onReconnect: () => () => {} }),
}));

vi.mock("../../../src/components/Terminal.vue", () => ({
  default: {
    name: "TerminalView",
    props: ["sessionId", "connectKey", "cwd", "hideHeader"],
    emits: ["session", "cwd"],
    template: '<div class="stub-term"><slot v-if="!hideHeader" name="header-lead" /><slot v-if="!hideHeader" name="header-actions" /></div>',
    methods: {
      terminate() {},
    },
  },
}));

const others = vi.hoisted(() => ({ list: [] as { key: string; label: string; source: { sessionId: string; cwd: string; agent: string } }[] }));
vi.mock("../../../src/composables/useHandoff", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../src/composables/useHandoff")>()),
  handoffTargets: () => others.list,
}));

const TerminalCell = (await import("../../../src/components/TerminalCell.vue")).default;

const OTHER = { key: "cell-2", label: "#2 · codex", source: { sessionId: "S2", cwd: "/w", agent: "codex" } };
const mountCell = () =>
  mount(TerminalCell, {
    props: {
      uid: 1,
      expanded: false,
      zoomed: false,
      reorderable: false,
      initialSessionId: "11111111-1111-1111-1111-111111111111",
      initialCwd: null,
      defaultCwd: "/home/me/proj",
      presets: [],
      home: "/home/me",
      cancellable: false,
      openSessionIds: [],
      openCwds: [],
    },
  });
const openTools = async (w: ReturnType<typeof mountCell>) => {
  await w.find('[data-testid="cell-tools-btn"]').trigger("click");
  await flushPromises();
};
const toolIds = () => [...document.body.querySelectorAll('[data-testid^="cell-pane-menu-"]')].map((el) => el.getAttribute("data-testid"));

afterEach(() => {
  others.list = [];
  document.body.innerHTML = "";
});

describe("talking to another terminal from the Tools menu", () => {
  it("has no header button of its own", async () => {
    others.list = [OTHER];
    const w = mountCell();
    await flushPromises();
    expect(w.find('[data-testid="cell-ask"]').exists()).toBe(false);
    w.unmount();
  });

  it("lists the talk row, with the forum glyph, above restart when another terminal is there", async () => {
    others.list = [OTHER];
    const w = mountCell();
    await openTools(w);
    expect(toolIds()).toEqual(["cell-pane-menu-tools", "cell-pane-menu-canvas", "cell-pane-menu-talk", "cell-pane-menu-restart"]);
    expect(document.body.querySelector('[data-testid="cell-pane-menu-talk"] .material-symbols-outlined')?.textContent).toBe("forum");
    w.unmount();
  });

  it("leaves the row out when there is no other terminal", async () => {
    const w = mountCell();
    await openTools(w);
    expect(toolIds()).not.toContain("cell-pane-menu-talk");
    expect(toolIds()).toContain("cell-pane-menu-restart");
    w.unmount();
  });

  // The list is a snapshot, so it is read again each time the menu opens.
  it("reads the other terminals again every time the menu opens", async () => {
    const w = mountCell();
    await openTools(w);
    expect(toolIds()).not.toContain("cell-pane-menu-talk");
    await w.find('[data-testid="cell-tools-btn"]').trigger("click"); // close
    others.list = [OTHER];
    await openTools(w);
    expect(toolIds()).toContain("cell-pane-menu-talk");
    w.unmount();
  });

  it("opens the talk panel when the row is picked", async () => {
    others.list = [OTHER];
    const w = mountCell();
    await openTools(w);
    document.body.querySelector<HTMLButtonElement>('[data-testid="cell-pane-menu-talk"]')?.click();
    await flushPromises();
    expect(w.find('[data-testid="cell-ask-menu"]').exists()).toBe(true);
    expect(w.findAll('[data-testid="cell-ask-item"]').map((b) => b.text())).toEqual(["#2 · codex"]);
    w.unmount();
  });

  // #2003's floor must not leave blank space above the empty line: the terminal the row was offered
  // for can be gone by the time it is picked, because the panel reads the list again as it opens.
  it("renders no list, only the empty line, when the other terminal is gone by the pick", async () => {
    others.list = [OTHER];
    const w = mountCell();
    await openTools(w);
    others.list = [];
    document.body.querySelector<HTMLButtonElement>('[data-testid="cell-pane-menu-talk"]')?.click();
    await flushPromises();
    expect(w.find('[data-testid="cell-ask-list"]').exists()).toBe(false);
    expect(w.find('[data-testid="cell-ask-menu"]').text()).toContain("No other terminal to read");
    w.unmount();
  });
});
