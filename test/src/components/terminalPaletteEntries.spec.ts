import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { ref } from "vue";

// #2465. A terminal offers its header buttons and palette commands to the command palette, and a
// pick runs through the same path as a click on the header: a shell entry becomes a `run`.
vi.mock("../../../src/composables/usePubSub", () => ({
  usePubSub: () => ({ subscribe: () => () => {}, onReconnect: () => () => {} }),
}));

vi.mock("../../../src/composables/useTerminalConnections", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../src/composables/useTerminalConnections")>()),
  attach: () => {},
  detach: () => {},
}));

const spies = vi.hoisted(() => ({ runHeaderButton: vi.fn() }));
vi.mock("../../../src/composables/useHeaderAction", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../src/composables/useHeaderAction")>()),
  runHeaderButton: spies.runHeaderButton,
}));

const BUTTONS = [{ id: "plain", label: "Plain", run: "input" as const, text: "hi" }];
const COMMANDS = [{ id: "release", label: "Release", run: "shell" as const }];
vi.mock("../../../src/composables/useHeaderButtons", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../src/composables/useHeaderButtons")>()),
  useHeaderButtons: () => ({ buttons: ref(BUTTONS), commands: ref(COMMANDS), chips: ref(null), env: ref([]), refresh: () => Promise.resolve() }),
}));

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

const Terminal = (await import("../../../src/components/Terminal.vue")).default;
const { paletteHeaderEntriesFor } = await import("../../../src/composables/paletteHeaderEntries");

let wrapper: VueWrapper | null = null;
afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  spies.runHeaderButton.mockClear();
});

describe("a terminal's entries for the command palette", () => {
  it("registers its buttons and commands under its slot, and withdraws them on unmount", () => {
    wrapper = mount(Terminal, { props: { persistKey: "cell-9", sessionId: "s1", connectKey: 0, cwd: "/work/proj" } });
    const entries = paletteHeaderEntriesFor("cell-9");
    expect(entries?.buttons().map((b) => b.id)).toEqual(["plain"]);
    expect(entries?.commands().map((b) => b.id)).toEqual(["release"]);
    wrapper.unmount();
    wrapper = null;
    expect(paletteHeaderEntriesFor("cell-9")).toBeNull();
  });

  it("runs a pick the way the header does: a shell entry as a run, anything else in place", () => {
    const w = mount(Terminal, { props: { persistKey: "cell-9", sessionId: "s1", connectKey: 0, cwd: "/work/proj" } });
    wrapper = w;
    const entries = paletteHeaderEntriesFor("cell-9");
    const [release] = COMMANDS;
    const [plain] = BUTTONS;
    if (release) entries?.run(release);
    expect(w.emitted("run")?.[0]?.[0]).toMatchObject({ source: "button", buttonId: "release", session: "s1" });
    if (plain) entries?.run(plain);
    expect(spies.runHeaderButton).toHaveBeenCalledWith(plain, "cell-9", expect.anything(), expect.any(Function));
  });

  it("offers nothing from a command or launcher terminal", () => {
    wrapper = mount(Terminal, {
      props: {
        persistKey: "cell-9",
        sessionId: null,
        connectKey: 0,
        cwd: "/work/proj",
        command: { source: "script" as const, index: 0, label: "dev", cwd: "/work/proj" },
      },
    });
    const entries = paletteHeaderEntriesFor("cell-9");
    expect(entries?.buttons()).toEqual([]);
    expect(entries?.commands()).toEqual([]);
  });
});
