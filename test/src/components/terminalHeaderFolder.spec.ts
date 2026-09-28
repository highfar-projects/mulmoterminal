import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { ref } from "vue";

// A `buttons` folder on row 2 (#2366): one icon, a menu of its buttons, and a pick that runs the
// child exactly as the same button would run at the top level.
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

const COMPACT = { id: "compact", label: "Compact this conversation", run: "input" as const, icon: "compress", text: "/compact" };
const TEST = { id: "test", label: "Run the tests", run: "shell" as const, icon: "science" };
const ENTRIES = [
  { id: "ops", label: "Operations", icon: "construction", items: [COMPACT, TEST] },
  { id: "plain", label: "Plain", run: "input" as const, text: "hi" },
];
vi.mock("../../../src/composables/useHeaderButtons", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../src/composables/useHeaderButtons")>()),
  useHeaderButtons: () => ({ buttons: ref(ENTRIES), chips: ref(null), env: ref([]), refresh: () => Promise.resolve() }),
}));

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

const Terminal = (await import("../../../src/components/Terminal.vue")).default;

let wrapper: VueWrapper | null = null;
afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  spies.runHeaderButton.mockClear();
});

const mountSessionTerminal = () => {
  wrapper = mount(Terminal, { props: { sessionId: "s1", connectKey: 0, cwd: "/work/proj" }, attachTo: document.body });
  return wrapper;
};
const trigger = () => document.querySelector<HTMLButtonElement>('[data-testid="header-folder"]');
const menu = () => document.querySelector<HTMLElement>('[data-testid="header-folder-menu"]');
const item = (id: string) => document.querySelector<HTMLButtonElement>(`[data-testid="header-folder-item-${id}"]`);
const openMenu = async () => {
  trigger()?.click();
  await flushPromises();
};

describe("Terminal header — a folder of buttons", () => {
  it("draws the folder as one button beside the plain ones, not its children", () => {
    const w = mountSessionTerminal();
    expect(trigger()?.getAttribute("aria-label")).toBe("Operations");
    expect(trigger()?.getAttribute("aria-haspopup")).toBe("menu");
    expect(w.find('[aria-label="Plain"]').exists()).toBe(true);
    expect(w.find('[aria-label="Compact this conversation"]').exists()).toBe(false);
    expect(menu()).toBeNull();
  });

  it("lists every child with its icon and label when opened", async () => {
    mountSessionTerminal();
    await openMenu();
    expect(trigger()?.getAttribute("aria-expanded")).toBe("true");
    const rows = [...(menu()?.querySelectorAll('[role="menuitem"]') ?? [])].map((el) => [
      el.querySelector(".material-symbols-outlined")?.textContent,
      el.lastElementChild?.textContent,
    ]);
    expect(rows).toEqual([
      ["compress", "Compact this conversation"],
      ["science", "Run the tests"],
    ]);
  });

  it("runs a picked child the way a top-level button runs, and closes the menu", async () => {
    mountSessionTerminal();
    await openMenu();
    item("compact")?.click();
    await flushPromises();
    expect(spies.runHeaderButton).toHaveBeenCalledTimes(1);
    expect(spies.runHeaderButton.mock.calls[0]?.[0]).toEqual(COMPACT);
    expect(menu()).toBeNull();
  });

  // A shell child is handed to a command cell by id, like a top-level shell button — the command
  // itself never reaches the browser.
  it("hands a picked shell child to a command cell by its id", async () => {
    const w = mountSessionTerminal();
    await openMenu();
    item("test")?.click();
    await flushPromises();
    const run = w.emitted("run")?.[0]?.[0];
    expect(run).toMatchObject({ source: "button", buttonId: "test", label: "Run the tests" });
    expect(spies.runHeaderButton).not.toHaveBeenCalled();
  });

  it("moves through the children with the arrows, and Escape hands focus back to the trigger", async () => {
    mountSessionTerminal();
    await openMenu();
    expect(document.activeElement).toBe(item("compact"));
    menu()?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    expect(document.activeElement).toBe(item("test"));
    menu()?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await flushPromises();
    expect(menu()).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });
});
