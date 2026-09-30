// #2729. The path menu on a cell opens Settings on that cell's directory.
import { describe, it, expect, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import { i18n } from "../../../src/i18n";
import { closeSettings, requestedSettingsDir, requestedSettingsTab, settingsOpen } from "../../../src/composables/settingsOpener";

const CellPathMenu = (await import("../../../src/components/CellPathMenu.vue")).default;

afterEach(() => closeSettings());

describe("CellPathMenu: this directory's settings", () => {
  it("opens Settings on the cell's own directory", async () => {
    const w = mount(CellPathMenu, { props: { cwd: "/work/shop", label: "shop", slotKey: null, layout: "lead" }, global: { plugins: [i18n] } });
    await w.find('[data-testid="cell-dir"]').trigger("click");
    await w.find('[data-testid="cell-path-dir-settings"]').trigger("click");
    expect(settingsOpen.value).toBe(true);
    expect(requestedSettingsTab.value).toBe("dirSettings");
    expect(requestedSettingsDir.value).toBe("/work/shop");
    expect(w.find('[data-testid="cell-path-menu"]').exists()).toBe(false);
  });
});
