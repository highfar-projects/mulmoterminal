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

  it("puts focus on the current choice when it opens", async () => {
    await openMenu("manual");
    await nextTick();
    await nextTick();
    expect(document.activeElement).toBe(option("manual"));
  });

  it("moves focus with the arrow keys, Home and End, wrapping at the ends", async () => {
    await openMenu("manual");
    await nextTick();
    await nextTick();
    const press = (key: string): void => {
      document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
    };
    press("ArrowDown");
    expect(document.activeElement).toBe(option("priority"));
    press("ArrowDown");
    expect(document.activeElement).toBe(option("auto"));
    press("ArrowUp");
    expect(document.activeElement).toBe(option("priority"));
    press("Home");
    expect(document.activeElement).toBe(option("auto"));
    press("End");
    expect(document.activeElement).toBe(option("priority"));
  });

  it.each(["Escape", "Tab"])("closes on %s from inside and hands focus back to the button", async (key) => {
    const wrapper = await openMenu("auto");
    await nextTick();
    await nextTick();
    option("auto").dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
    await nextTick();
    expect(menuOpen()).toBe(false);
    expect(document.activeElement).toBe(wrapper.get("button").element);
  });

  it("hands focus back to the button after a choice", async () => {
    const wrapper = await openMenu("auto");
    option("manual").click();
    await nextTick();
    expect(document.activeElement).toBe(wrapper.get("button").element);
  });

  it("closes on a scroll, since a fixed menu would drift away from its button", async () => {
    await openMenu("auto");
    document.body.dispatchEvent(new Event("scroll"));
    await nextTick();
    expect(menuOpen()).toBe(false);
  });

  it("is never wider than the window, less a margin", async () => {
    await openMenu("auto");
    expect(document.querySelector(MENU)?.className).toContain("calc(100vw-16px)");
  });

  it("closes on Escape", async () => {
    await openMenu("auto");
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await nextTick();
    expect(menuOpen()).toBe(false);
  });
});
