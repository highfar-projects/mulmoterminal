import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";

const FilesOutlineMenu = (await import("../../../src/components/FilesOutlineMenu.vue")).default;

// #2576. The Outline button and its list.
const HEADINGS = [
  { level: 1, text: "One", line: 1 },
  { level: 2, text: "Two", line: 5 },
];

describe("FilesOutlineMenu", () => {
  it("asks for the headings when it opens, and lists them indented by level", async () => {
    const w = mount(FilesOutlineMenu, { props: { headings: HEADINGS, current: 1 }, attachTo: document.body });
    await w.get('[data-testid="files-outline-btn"]').trigger("click");
    expect(w.emitted("opened")).toHaveLength(1);
    const rows = w.findAll('[data-testid="files-outline-heading"]');
    expect(rows.map((r) => r.text())).toEqual(["One", "Two"]);
    expect(rows[1]?.attributes("aria-current")).toBe("location");
    expect(rows[1]?.attributes("style")).toContain("padding-left: 20px");
    w.unmount();
  });

  it("closes and asks for the heading picked", async () => {
    const w = mount(FilesOutlineMenu, { props: { headings: HEADINGS, current: null }, attachTo: document.body });
    await w.get('[data-testid="files-outline-btn"]').trigger("click");
    await w.findAll('[data-testid="files-outline-heading"]')[0]?.trigger("click");
    expect(w.emitted("pick")?.[0]).toEqual([0]);
    expect(w.find('[data-testid="files-outline"]').exists()).toBe(false);
    w.unmount();
  });

  it("says when there are no headings", async () => {
    const w = mount(FilesOutlineMenu, { props: { headings: [], current: null }, attachTo: document.body });
    await w.get('[data-testid="files-outline-btn"]').trigger("click");
    expect(w.text()).toContain("No headings");
    w.unmount();
  });
});
