// #2569. The search box switch sits beside the load average one, and a refused save puts it back.
import { describe, it, expect, vi, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import GridHeaderSection from "../../../../src/components/settings/GridHeaderSection.vue";
import { i18n } from "../../../../src/i18n";
import { paletteSearchBox, setPaletteSearchBox } from "../../../../src/composables/paletteSearchBox";
import { setUsageGauge, setUsageProbeIntervalMinutes, usageGauge, usageProbeIntervalMinutes } from "../../../../src/composables/usageGauge";

const server = vi.hoisted(() => ({ ok: true, calls: [] as [string, unknown][] }));
vi.mock("../../../../src/composables/postConfigField", () => ({
  postConfigField: async (field: string, value: unknown) => {
    server.calls.push([field, value]);
    return server.ok ? { ok: true, value } : { ok: false };
  },
}));

afterEach(() => {
  setPaletteSearchBox(false);
  setUsageGauge(true);
  setUsageProbeIntervalMinutes(10);
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

// #3153. The gauge's own switch, and the minutes its Claude reading may age, above the load average.
describe("GridHeaderSection — the usage gauge", () => {
  const gaugeInput = (wrapper: ReturnType<typeof mount>) =>
    wrapper.find<HTMLInputElement>(`input[aria-label="${i18n.global.t("settingsControls.usageGauge.field")}"]`);
  const stepperButton = (wrapper: ReturnType<typeof mount>, direction: "increase" | "decrease") =>
    wrapper.findAll("button").find((button) => button.attributes("aria-label")?.toLowerCase().startsWith(direction));

  it("starts on, and saves usageGauge when switched off", async () => {
    const wrapper = mount(GridHeaderSection, { global: { plugins: [i18n] } });
    const input = gaugeInput(wrapper);
    expect(input.element.checked).toBe(true);
    await input.setValue(false);
    await flushPromises();
    expect(server.calls).toEqual([["usageGauge", false]]);
    expect(usageGauge.value).toBe(false);
    wrapper.unmount();
  });

  it("puts the box back when the save is refused", async () => {
    server.ok = false;
    const wrapper = mount(GridHeaderSection, { global: { plugins: [i18n] } });
    const input = gaugeInput(wrapper);
    await input.setValue(false);
    await flushPromises();
    expect(input.element.checked).toBe(true);
    expect(usageGauge.value).toBe(true);
    wrapper.unmount();
  });

  it("saves the interval one minute at a time", async () => {
    const wrapper = mount(GridHeaderSection, { global: { plugins: [i18n] } });
    await stepperButton(wrapper, "increase")?.trigger("click");
    await flushPromises();
    expect(server.calls).toEqual([["usageProbeIntervalMinutes", 11]]);
    expect(usageProbeIntervalMinutes.value).toBe(11);
    wrapper.unmount();
  });

  it("does not let the interval be changed while the gauge is off", async () => {
    setUsageGauge(false);
    const wrapper = mount(GridHeaderSection, { global: { plugins: [i18n] } });
    expect(stepperButton(wrapper, "increase")?.attributes("disabled")).toBeDefined();
    wrapper.unmount();
  });
});
