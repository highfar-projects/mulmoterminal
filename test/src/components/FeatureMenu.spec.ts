// The toolbar's feature menu: one button opening Rooms / Blueprints / Worklog as commands.
import { describe, it, expect, afterEach } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { nextTick } from "vue";
import FeatureMenu from "../../../src/components/FeatureMenu.vue";
import type { FeatureMenuEntry } from "../../../src/components/featureMenuEntries";

// The menu is teleported to <body>, so it lives outside the wrapper — query the document.
const MENU = '[data-testid="feature-menu"]';
const ALL: FeatureMenuEntry[] = ["rooms", "blueprints", "worklog"];
const menuOpen = (): boolean => document.querySelector(MENU) !== null;
const item = (entry: FeatureMenuEntry): HTMLElement => {
  const el = document.querySelector<HTMLElement>(`[data-testid="feature-menu-${entry}"]`);
  if (!el) throw new Error(`no ${entry} item`);
  return el;
};
const listed = (): (string | null)[] => [...document.querySelectorAll(`${MENU} [role="menuitem"]`)].map((el) => el.getAttribute("data-testid"));

let mounted: VueWrapper | null = null;
const mountMenu = (entries: FeatureMenuEntry[]) => {
  mounted = mount(FeatureMenu, { props: { entries }, attachTo: document.body });
  return mounted;
};
const openMenu = async (entries: FeatureMenuEntry[] = ALL) => {
  const wrapper = mountMenu(entries);
  await wrapper.get("button").trigger("click");
  await nextTick();
  await nextTick();
  return wrapper;
};
const press = (key: string): void => {
  document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
};

afterEach(() => {
  mounted?.unmount();
  mounted = null;
});

describe("FeatureMenu", () => {
  it("is a named menu button with the widgets icon, and starts closed", () => {
    const button = mountMenu(ALL).get("button");
    expect(button.attributes("aria-label")).toBe("More features");
    expect(button.attributes("data-tip")).toBe("More features");
    expect(button.attributes("aria-haspopup")).toBe("menu");
    expect(button.attributes("aria-expanded")).toBe("false");
    expect(button.text()).toBe("widgets");
    expect(menuOpen()).toBe(false);
  });

  it("opens on a press and lists the entries in order, as commands", async () => {
    const wrapper = await openMenu();
    expect(wrapper.get("button").attributes("aria-expanded")).toBe("true");
    expect(listed()).toEqual(["feature-menu-rooms", "feature-menu-blueprints", "feature-menu-worklog"]);
  });

  it("lists only the entries it is given", async () => {
    await openMenu(["blueprints"]);
    expect(listed()).toEqual(["feature-menu-blueprints"]);
  });

  it("gives each entry its icon, name and a line saying what it is", async () => {
    await openMenu();
    expect(item("rooms").textContent).toContain("forum");
    expect(item("rooms").textContent).toContain("Round-table");
    expect(item("blueprints").textContent).toContain("architecture");
    expect(item("blueprints").textContent).toContain("Blueprints");
    expect(item("worklog").textContent).toContain("history_edu");
    expect(item("worklog").textContent).toContain("#worklog");
  });

  it.each(ALL)("emits %s when it is chosen, closes, and hands focus back", async (entry) => {
    const wrapper = await openMenu();
    item(entry).click();
    await nextTick();
    expect(wrapper.emitted("select")).toEqual([[entry]]);
    expect(menuOpen()).toBe(false);
    expect(document.activeElement).toBe(wrapper.get("button").element);
  });

  it("puts focus on the first entry when it opens", async () => {
    await openMenu();
    expect(document.activeElement).toBe(item("rooms"));
  });

  it("moves focus with the arrow keys, Home and End, wrapping at the ends", async () => {
    await openMenu();
    press("ArrowDown");
    expect(document.activeElement).toBe(item("blueprints"));
    press("ArrowDown");
    press("ArrowDown");
    expect(document.activeElement).toBe(item("rooms"));
    press("ArrowUp");
    expect(document.activeElement).toBe(item("worklog"));
    press("Home");
    expect(document.activeElement).toBe(item("rooms"));
    press("End");
    expect(document.activeElement).toBe(item("worklog"));
  });

  it.each(["Escape", "Tab"])("closes on %s from inside and hands focus back to the button", async (key) => {
    const wrapper = await openMenu();
    press(key);
    await nextTick();
    expect(menuOpen()).toBe(false);
    expect(document.activeElement).toBe(wrapper.get("button").element);
  });

  it("stays open when pressed inside, and closes on a press elsewhere", async () => {
    await openMenu();
    item("rooms").dispatchEvent(new Event("pointerdown", { bubbles: true }));
    await nextTick();
    expect(menuOpen()).toBe(true);
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    await nextTick();
    expect(menuOpen()).toBe(false);
  });

  it("closes on a scroll, since a fixed menu would drift away from its button", async () => {
    await openMenu();
    document.body.dispatchEvent(new Event("scroll"));
    await nextTick();
    expect(menuOpen()).toBe(false);
  });

  it("is never wider than the window, less a margin", async () => {
    await openMenu();
    expect(document.querySelector(MENU)?.className).toContain("calc(100vw-16px)");
  });
});
