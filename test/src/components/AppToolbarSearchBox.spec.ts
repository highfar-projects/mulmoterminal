// #2569. The top bar's search box: absent unless switched on, and it opens the command palette.
// Its own file because AppToolbar.spec.ts is near the length limit.
import { describe, it, expect, afterEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import AppToolbar from "../../../src/components/AppToolbar.vue";
import { router } from "../../../src/router/index";
import { closeCommandPalette, paletteOpen } from "../../../src/composables/commandPalette";
import { setPaletteSearchBox } from "../../../src/composables/paletteSearchBox";
import { setActiveKeymap } from "../../../src/composables/activeKeymap";

vi.mock("../../../src/composables/useShortcuts", async () => {
  const { computed } = await import("vue");
  return { useShortcuts: () => ({ shortcuts: computed(() => []) }) };
});

const mountBar = async () => {
  await router.push("/terminals");
  await flushPromises();
  const wrapper = mount(AppToolbar, { global: { plugins: [router], stubs: { NotificationBell: true, RemoteHostControl: true } } });
  await flushPromises();
  return wrapper;
};
const box = (wrapper: Awaited<ReturnType<typeof mountBar>>) => wrapper.find('[data-testid="palette-search-box"]');

afterEach(() => {
  setPaletteSearchBox(false);
  setActiveKeymap(null);
  closeCommandPalette();
});

describe("the top bar's search box", () => {
  it("is not there unless switched on", async () => {
    const wrapper = await mountBar();
    expect(box(wrapper).exists()).toBe(false);
    wrapper.unmount();
  });

  it("opens the command palette when switched on and clicked", async () => {
    setPaletteSearchBox(true);
    const wrapper = await mountBar();
    expect(box(wrapper).exists()).toBe(true);
    await box(wrapper).trigger("click");
    expect(paletteOpen.value).toBe(true);
    wrapper.unmount();
  });

  it("shows the palette's key when one is bound, and none when it is not", async () => {
    setPaletteSearchBox(true);
    const unbound = await mountBar();
    expect(box(unbound).find("code").exists()).toBe(false);
    unbound.unmount();
    setActiveKeymap({ "command-palette": "Cmd+Shift+p" });
    const bound = await mountBar();
    expect(box(bound).find("code").text()).toBe("Cmd+Shift+p");
    bound.unmount();
  });
});
