// #2569. The search box switch sits beside the load average one, and a refused save puts it back.
import { describe, it, expect, vi, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import GridHeaderSection from "../../../../src/components/settings/GridHeaderSection.vue";
import { i18n } from "../../../../src/i18n";
import { paletteSearchBox, setPaletteSearchBox } from "../../../../src/composables/paletteSearchBox";

const server = vi.hoisted(() => ({ ok: true, calls: [] as [string, unknown][] }));
vi.mock("../../../../src/composables/postConfigField", () => ({
  postConfigField: async (field: string, value: unknown) => {
    server.calls.push([field, value]);
    return server.ok ? { ok: true, value } : { ok: false };
  },
}));

afterEach(() => {
  setPaletteSearchBox(false);
  server.ok = true;
  server.calls.length = 0;
});

const searchBoxInput = (wrapper: ReturnType<typeof mount>) =>
  wrapper.find<HTMLInputElement>(`input[aria-label="${i18n.global.t("settings.gridHeader.searchBox")}"]`);

describe("GridHeaderSection — the search box switch", () => {
  it("starts off, and saves paletteSearchBox when switched on", async () => {
    const wrapper = mount(GridHeaderSection, { global: { plugins: [i18n] } });
    const input = searchBoxInput(wrapper);
    expect(input.element.checked).toBe(false);
    await input.setValue(true);
    await flushPromises();
    expect(server.calls).toEqual([["paletteSearchBox", true]]);
    expect(paletteSearchBox.value).toBe(true);
    wrapper.unmount();
  });

  it("puts the box back when the save is refused", async () => {
    server.ok = false;
    const wrapper = mount(GridHeaderSection, { global: { plugins: [i18n] } });
    const input = searchBoxInput(wrapper);
    await input.setValue(true);
    await flushPromises();
    expect(input.element.checked).toBe(false);
    expect(paletteSearchBox.value).toBe(false);
    wrapper.unmount();
  });
});
