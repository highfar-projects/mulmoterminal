// Accounting's only entry is the first control on the Collections screen's top row — ahead of
// the pinned favourites, which come and go.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { computed, ref } from "vue";
import type { Shortcut } from "../../../common/shortcuts";

const pinned = ref<Shortcut[]>([]);
vi.mock("../../../src/composables/useShortcuts", () => ({
  useShortcuts: () => ({ shortcuts: computed(() => pinned.value), reconcile: vi.fn(), unpin: vi.fn() }),
}));
vi.mock("@mulmoclaude/collection-plugin/vue", () => ({
  configureCollectionUi: () => undefined,
  CollectionsIndexView: { name: "CollectionsIndexView", template: "<div />" },
  CollectionView: { name: "CollectionView", template: "<div />" },
  FeedsView: { name: "FeedsView", template: "<div />" },
}));

const { router } = await import("../../../src/router/index");
const CollectionsBrowseOverlay = (await import("../../../src/components/CollectionsBrowseOverlay.vue")).default;

const STUBS = { PluginFrame: true, CollectionChatPane: true, LaunchAgentPicker: true, ChatModalAgentPicker: true };

const mountAtCollections = async () => {
  await router.push("/collections");
  await flushPromises();
  const wrapper = mount(CollectionsBrowseOverlay, { global: { plugins: [router], stubs: STUBS } });
  await flushPromises();
  return wrapper;
};

beforeEach(() => {
  pinned.value = [];
});

describe("CollectionsBrowseOverlay's Accounting entry", () => {
  it("is on the row even when nothing is pinned, named for a screen reader and the tip", async () => {
    const button = (await mountAtCollections()).get('[data-testid="collections-accounting"]');
    expect(button.attributes("aria-label")).toBe("Accounting");
    expect(button.attributes("data-tip")).toBe("Accounting");
  });

  it("comes before the pinned favourites", async () => {
    pinned.value = [{ kind: "collection", slug: "tasks", title: "Tasks", icon: "check" }];
    const buttons = (await mountAtCollections()).findAll("button");
    expect(buttons[0]?.attributes("data-testid")).toBe("collections-accounting");
    expect(buttons.some((b) => b.attributes("aria-label") === "Tasks")).toBe(true);
  });

  it("opens the accounting view", async () => {
    const wrapper = await mountAtCollections();
    await wrapper.get('[data-testid="collections-accounting"]').trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.name).toBe("accounting");
  });
});
