// The grid-ordering control: a button showing the current mode that opens a menu of all three.
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import SortModeMenu from "../../../src/components/SortModeMenu.vue";
import type { SortMode } from "../../../src/components/gridTabs";

// The menu is teleported to <body>, so it lives outside the wrapper — query the document.
const MENU = '[data-testid="sort-mode-menu"]';
const menuOpen = (): boolean => document.querySelector(MENU) !== null;
const option = (mode: SortMode): HTMLElement => {
  const el = document.querySelector<HTMLElement>(`[data-testid="sort-mode-${mode}"]`);
  if (!el) throw new Error(`no ${mode} option`);
  return el;
};
const mountMenu = (mode: SortMode) => mount(SortModeMenu, { props: { mode }, attachTo: document.body });
const openMenu = async (mode: SortMode) => {
  const wrapper = mountMenu(mode);
  await wrapper.get("button").trigger("click");
  await nextTick();
  return wrapper;
};

describe("SortModeMenu", () => {
  it("names the current mode on the button, and starts closed", () => {
    const button = mountMenu("priority").get("button");
    expect(button.attributes("aria-label")).toBe("Grid cell ordering: Project priority");
    expect(button.attributes("aria-haspopup")).toBe("menu");
    expect(button.attributes("aria-expanded")).toBe("false");
    expect(menuOpen()).toBe(false);
  });

  it("lists all three modes with the current one checked", async () => {
    const wrapper = await openMenu("auto");
    expect(wrapper.get("button").attributes("aria-expanded")).toBe("true");
    const checked = [...document.querySelectorAll(`${MENU} [role="menuitemradio"]`)].map((el) => [
      el.getAttribute("data-testid"),
      el.getAttribute("aria-checked"),
    ]);
    expect(checked).toEqual([
      ["sort-mode-auto", "true"],
      ["sort-mode-manual", "false"],
      ["sort-mode-priority", "false"],
    ]);
  });

  it("says what each mode does, including where priority comes from", async () => {
    await openMenu("manual");
    expect(option("priority").textContent).toContain("orderPriority");
    expect(option("auto").textContent).toContain("Attention first");
  });

  it("emits the chosen mode and closes", async () => {
    const wrapper = await openMenu("auto");
    option("priority").click();
    await nextTick();
    expect(wrapper.emitted("select")).toEqual([["priority"]]);
    expect(menuOpen()).toBe(false);
  });

  it("stays open when pressed inside, and closes on a press elsewhere", async () => {
    await openMenu("auto");
    option("manual").dispatchEvent(new Event("pointerdown", { bubbles: true }));
    await nextTick();
    expect(menuOpen()).toBe(true);
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    await nextTick();
    expect(menuOpen()).toBe(false);
  });

  it("closes on Escape", async () => {
    await openMenu("auto");
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await nextTick();
    expect(menuOpen()).toBe(false);
  });
});
