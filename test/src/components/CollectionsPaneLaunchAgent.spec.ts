import { describe, it, expect, vi, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";

// The plugin's Vue surfaces and the preview pull large module graphs and render inside a shadow
// root; neither is what this spec is about. Stubbed at the module boundary so the pane mounts as
// itself — the same treatment CollectionsPaneSharedApp.spec.ts gives them.
vi.mock("@mulmoclaude/collection-plugin/vue", () => ({
  CollectionsIndexView: { name: "CollectionsIndexView", template: "<div>index</div>" },
  CollectionView: { name: "CollectionView", template: "<div>collection</div>" },
  FeedsView: { name: "FeedsView", template: "<div>feeds</div>" },
  configureCollectionUi: () => {},
}));
vi.mock("../../../src/components/PluginFrame.vue", () => ({
  default: { name: "PluginFrame", template: "<div><slot /></div>" },
}));
vi.mock("../../../src/components/SharedAppPreview.vue", () => ({
  default: { name: "SharedAppPreview", props: ["cwd", "pickerTarget"], template: "<div>the preview</div>" },
}));
vi.mock("../../../src/composables/collectionProject", () => ({
  projectIdForCwd: async () => "p1",
}));

// Module scope, not inside a test: an `await import` in an `it` bills the whole module graph
// against that test's timeout (CLAUDE.md).
const CollectionsPane = (await import("../../../src/components/CollectionsPane.vue")).default;
const { launchAgent } = await import("../../../src/composables/useChatLauncher");

afterEach(() => {
  launchAgent.value = "claude";
});

const PICKER = '[data-testid="launch-agent-picker"]';

function mountPane() {
  globalThis.fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ declared: false }) }) as unknown as Response) as unknown as typeof fetch;
  return mount(CollectionsPane, { props: { cwd: "/srv/plain" } });
}

// A card action or a template card pressed in HERE starts a chat through the same global the
// Collections overlay's dropdown writes — and this pane has no dropdown, which is how a Muse
// session came out of a button the user read as Claude's (#1938).
describe("CollectionsPane launch agent", () => {
  it("says nothing while chats here start the default agent", async () => {
    const w = mountPane();
    await flushPromises();
    expect(w.find(PICKER).exists()).toBe(false);
  });

  it("shows what will actually start once that is not claude", async () => {
    launchAgent.value = "muse";
    const w = mountPane();
    await flushPromises();
    expect(w.find(PICKER).exists()).toBe(true);
    expect((w.get(`${PICKER} select`).element as HTMLSelectElement).value).toBe("muse");
  });

  it("lets it be changed back from here, without going to find the Collections overlay", async () => {
    launchAgent.value = "muse";
    const w = mountPane();
    await flushPromises();
    await w.get(`${PICKER} select`).setValue("claude");
    await flushPromises();
    expect(launchAgent.value).toBe("claude");
    // And having been returned to the default, it stands down again.
    expect(w.find(PICKER).exists()).toBe(false);
  });
});
