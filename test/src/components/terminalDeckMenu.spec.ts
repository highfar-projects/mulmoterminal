// The Mulmo menu's other half (#1948): the menu names a deck, and THIS component turns it into a
// card. Worth its own spec because every way it can end without a Canvas has to say something —
// the button was offered, so a click that looks ignored is the failure #1941 removed.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { useAppConfig } from "../../../src/composables/useAppConfig";

vi.mock("../../../src/composables/usePubSub", () => ({
  usePubSub: () => ({ subscribe: () => () => {}, onReconnect: () => () => {} }),
}));

vi.mock("../../../src/composables/useTerminalConnections", async () => {
  const { reactive } = await import("vue");
  return {
    connView: reactive(new Map()),
    attach: () => {},
    setFont: () => {},
    setTheme: () => {},
    detach: () => {},
    release: () => {},
    retarget: () => {},
    terminate: () => {},
    fit: () => {},
    focus: () => {},
    insertText: () => {},
    sendView: () => {},
    readBuffer: () => null,
    submitText: () => true,
    isClaudeTarget: () => false,
  };
});

// The hint's text is translated through a server round trip; the English is shown first and is
// what this spec is about.
vi.mock("../../../src/utils/translateUiSentence", () => ({ translateUiSentence: async (s: string) => s }));

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// Module scope: a component's module load is not a test's work (see CLAUDE.md).
const Terminal = (await import("../../../src/components/Terminal.vue")).default;

const WS = "/work/ws";
const DECK = { path: `${WS}/decks/talk.json`, label: "Launch talk" };
const SCRIPT = { $mulmocast: { version: "1.1" }, beats: [] };

type Reply = { ok?: boolean; status?: number; body: unknown };
const routes = { decks: { body: { decks: [DECK] } } as Reply, reopen: { body: {} } as Reply, seed: { body: { ok: true } } as Reply };

const replyFor = (url: string): Reply => {
  if (url.includes("/api/mulmo/decks")) return routes.decks;
  if (url.includes("presentMulmoScript")) return routes.reopen;
  if (url.includes("/api/agent/toolResult")) return routes.seed;
  return { body: {} };
};

const mountTerminal = async () => {
  const w = mount(Terminal, { props: { sessionId: "s-1", connectKey: 1, persistKey: "deck-spec", cwd: WS, runMenu: true } });
  await flushPromises();
  return w;
};

const pickFirstDeck = async (w: Awaited<ReturnType<typeof mountTerminal>>) => {
  await w.find('[data-testid="mulmo-menu-btn"]').trigger("click");
  await w.find('[data-testid="mulmo-menu-item"]').trigger("click");
  await flushPromises();
};

const hint = (w: Awaited<ReturnType<typeof mountTerminal>>) => w.find('[role="status"]').text();

beforeEach(() => {
  useAppConfig().storiesRoots.value = [{ id: "root-a", paths: [WS] }];
  routes.decks = { body: { decks: [DECK] } };
  routes.reopen = { body: { ok: true, script: SCRIPT, filePath: "stories/decks/talk.json", root: "root-a" } };
  routes.seed = { body: { ok: true } };
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const pick = replyFor(url);
    return { ok: pick.ok ?? true, status: pick.status ?? 200, json: async () => pick.body } as unknown as Response;
  }) as unknown as typeof fetch;
});
afterEach(() => {
  useAppConfig().storiesRoots.value = [];
});

describe("picking a deck from the Mulmo menu", () => {
  it("seeds the card and asks the grid to show the Canvas", async () => {
    const w = await mountTerminal();
    await pickFirstDeck(w);
    const seeded = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.filter((c) => String(c[0]).includes("/api/agent/toolResult"));
    expect(seeded).toHaveLength(1);
    expect(w.emitted("canvas")).toHaveLength(1);
  });

  // The server's own sentence, for the reason #1941 exists: it names the file and says what to do.
  it("shows the server's reason instead of opening anything", async () => {
    routes.reopen = { body: { ok: false, code: "not_found", error: "File not found: stories/decks/talk.json" } };
    const w = await mountTerminal();
    await pickFirstDeck(w);
    expect(hint(w)).toContain("File not found: stories/decks/talk.json");
    expect(w.emitted("canvas")).toBeUndefined();
  });

  // The seed is a second round trip and it can fail on its own. Without this the deck would be
  // announced as shown and the Canvas would open empty.
  it("says so when the card could not be stored", async () => {
    routes.seed = { ok: false, status: 500, body: {} };
    const w = await mountTerminal();
    await pickFirstDeck(w);
    expect(hint(w)).toContain("could not put the deck on the Canvas");
    expect(w.emitted("canvas")).toBeUndefined();
  });

  it("says so when there is no session to show it beside", async () => {
    const w = mount(Terminal, { props: { sessionId: null, connectKey: 1, persistKey: "deck-spec-2", cwd: WS, runMenu: true } });
    await flushPromises();
    await pickFirstDeck(w);
    expect(hint(w)).toContain("Start the terminal first");
    expect(w.emitted("canvas")).toBeUndefined();
  });
});
