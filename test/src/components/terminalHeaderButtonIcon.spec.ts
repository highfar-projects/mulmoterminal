import { describe, it, expect, vi, beforeAll } from "vitest";
import { mount } from "@vue/test-utils";
import { ref } from "vue";

// A configured header button names its icon by string: `github:<name>` must reach the Octicon, and
// every other value must stay a Material Symbols ligature — the default PR button is the first of
// the former, and every button a user already wrote is the latter.
vi.mock("../../../src/composables/usePubSub", () => ({
  usePubSub: () => ({ subscribe: () => () => {}, onReconnect: () => () => {} }),
}));

vi.mock("../../../src/composables/useTerminalConnections", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../src/composables/useTerminalConnections")>()),
  attach: () => {},
  detach: () => {},
}));

const BUTTONS = [
  { id: "pr", label: "Open this branch's PR", run: "open" as const, icon: "github:git-pull-request", open: { url: "https://example.com" } },
  { id: "compact", label: "Compact", run: "input" as const, icon: "compress", text: "/compact" },
  { id: "plain", label: "Plain", run: "input" as const, text: "hi" },
];
vi.mock("../../../src/composables/useHeaderButtons", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../src/composables/useHeaderButtons")>()),
  useHeaderButtons: () => ({ buttons: ref(BUTTONS), chips: ref(null), env: ref([]), refresh: () => Promise.resolve() }),
}));

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

const Terminal = (await import("../../../src/components/Terminal.vue")).default;

const mountSessionTerminal = () => mount(Terminal, { props: { sessionId: "s1", connectKey: 0, cwd: "/work/proj" }, global: { stubs: { teleport: true } } });

describe("Terminal header — a configured button's icon", () => {
  it("draws github:git-pull-request as GitHub's pull-request Octicon", () => {
    const button = mountSessionTerminal().find(`[aria-label="Open this branch's PR"]`);
    expect(button.find("svg").attributes("data-github-icon")).toBe("git-pull-request");
    expect(button.find(".material-symbols-outlined").exists()).toBe(false);
  });

  it("keeps a Material Symbols name as the ligature, and bolt when none is given", () => {
    const w = mountSessionTerminal();
    expect(w.find('[aria-label="Compact"] .material-symbols-outlined').text()).toBe("compress");
    expect(w.find('[aria-label="Plain"] .material-symbols-outlined').text()).toBe("bolt");
  });
});
