// The shared frame of the toolbar and header menus: a trigger slot and a panel teleported to <body>.
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { h, nextTick } from "vue";
import AnchoredMenu from "../../../src/components/AnchoredMenu.vue";
import type { AnchoredMenuInitialFocus } from "../../../src/components/anchoredMenuFocus";

const PANEL = '[data-testid="frame-menu"]';
const panel = (): HTMLElement | null => document.querySelector<HTMLElement>(PANEL);
const items = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>(`${PANEL} [role="menuitemradio"]`)];

const mountMenu = (options: { label?: string; initialFocus?: AnchoredMenuInitialFocus } = {}) =>
  mount(AnchoredMenu, {
    props: {
      itemSelector: '[role="menuitemradio"]',
      initialFocus: options.initialFocus ?? "first",
      panelClass: "frame-panel",
      testid: "frame-menu",
      ...(options.label === undefined ? {} : { label: options.label }),
    },
    slots: {
      trigger: ({ open, toggle }: { open: boolean; toggle: () => void }) =>
        h("button", { type: "button", "data-testid": "frame-trigger", "aria-expanded": open, onClick: toggle }, "open"),
      default: () =>
        ["a", "b", "c"].map((id) => h("button", { type: "button", role: "menuitemradio", "aria-checked": id === "b", "data-testid": `item-${id}` }, id)),
    },
    attachTo: document.body,
  });

const openMenu = async (options: Parameters<typeof mountMenu>[0] = {}) => {
  const wrapper = mountMenu(options);
  await wrapper.get('[data-testid="frame-trigger"]').trigger("click");
  await nextTick();
  await nextTick();
  return wrapper;
};

describe("AnchoredMenu", () => {
  it("renders the trigger closed, with no panel", () => {
    const wrapper = mountMenu();
    expect(wrapper.get('[data-testid="frame-trigger"]').attributes("aria-expanded")).toBe("false");
    expect(panel()).toBeNull();
  });

  it("opens a role=menu panel in <body> carrying the caller's class, testid and items", async () => {
    const wrapper = await openMenu({ label: "Things" });
    expect(wrapper.get('[data-testid="frame-trigger"]').attributes("aria-expanded")).toBe("true");
    const opened = panel();
    expect(opened?.getAttribute("role")).toBe("menu");
    expect(opened?.getAttribute("aria-label")).toBe("Things");
    expect(opened?.classList.contains("frame-panel")).toBe(true);
    expect(opened?.parentElement).toBe(document.body);
    expect(items().map((item) => item.textContent)).toEqual(["a", "b", "c"]);
  });

  it("leaves aria-label off the panel when no label is given", async () => {
    await openMenu();
    expect(panel()?.hasAttribute("aria-label")).toBe(false);
  });

  it.each([
    ["first", "item-a"],
    ["checked", "item-b"],
    ["checkedOrFirst", "item-b"],
  ] as const)("focuses by %s on open", async (initialFocus, testid) => {
    await openMenu({ initialFocus });
    expect(document.activeElement?.getAttribute("data-testid")).toBe(testid);
  });

  it("stays open on a press inside the panel, and closes on a press elsewhere", async () => {
    await openMenu();
    items()[0]?.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    await nextTick();
    expect(panel()).not.toBeNull();
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    await nextTick();
    expect(panel()).toBeNull();
  });

  it("moves focus with the arrows and closes on Escape, handing focus back to the trigger", async () => {
    await openMenu();
    panel()?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    expect(document.activeElement?.getAttribute("data-testid")).toBe("item-b");
    panel()?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await nextTick();
    expect(panel()).toBeNull();
    expect(document.activeElement?.getAttribute("data-testid")).toBe("frame-trigger");
  });

  it("exposes close, which shuts the panel without moving focus", async () => {
    const wrapper = await openMenu();
    items()[2]?.focus();
    wrapper.vm.close();
    await nextTick();
    expect(panel()).toBeNull();
    expect(document.activeElement?.getAttribute("data-testid")).not.toBe("frame-trigger");
  });

  it("exposes leave, which shuts the panel and refocuses the trigger", async () => {
    const wrapper = await openMenu();
    expect(wrapper.vm.open).toBe(true);
    wrapper.vm.leave();
    await nextTick();
    expect(panel()).toBeNull();
    expect(wrapper.vm.open).toBe(false);
    expect(document.activeElement?.getAttribute("data-testid")).toBe("frame-trigger");
  });
});
