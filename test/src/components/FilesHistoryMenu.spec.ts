import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";

const FilesHistoryMenu = (await import("../../../src/components/FilesHistoryMenu.vue")).default;
const FilesComparingBanner = (await import("../../../src/components/FilesComparingBanner.vue")).default;

// #2574. The History list and the banner shown while comparing: what they show, and what they ask
// the pane to do.
const ENTRY = { id: "000000000001000-001-a.ts.bak", at: 1000, bytes: 3 };

describe("FilesHistoryMenu", () => {
  it("shows nothing but the button while closed, and asks to open", async () => {
    const w = mount(FilesHistoryMenu, { props: { open: false, entries: [ENTRY], failed: false, restoreFailed: false } });
    expect(w.find('[data-testid="files-history"]').exists()).toBe(false);
    await w.get('[data-testid="files-history-btn"]').trigger("click");
    expect(w.emitted("toggle")).toHaveLength(1);
  });

  it("lists each version and asks to compare or restore that one", async () => {
    const w = mount(FilesHistoryMenu, { props: { open: true, entries: [ENTRY], failed: false, restoreFailed: false } });
    expect(w.findAll('[data-testid="files-history-entry"]')).toHaveLength(1);
    await w.get('[data-testid="files-history-compare"]').trigger("click");
    await w.get('[data-testid="files-history-restore"]').trigger("click");
    expect(w.emitted("compare")?.[0]).toEqual([ENTRY]);
    expect(w.emitted("restore")?.[0]).toEqual([ENTRY]);
  });

  // A restore refused from the menu (a save in flight, a bank the disk refused) says so where it was clicked.
  it("says when a restore started here did not land", () => {
    const w = mount(FilesHistoryMenu, { props: { open: true, entries: [ENTRY], failed: false, restoreFailed: true } });
    expect(w.get('[data-testid="files-history-restore-failed"]').text()).toContain("Could not restore");
  });

  it("says when there is nothing yet, and when the history could not be read", () => {
    expect(mount(FilesHistoryMenu, { props: { open: true, entries: [], failed: false, restoreFailed: false } }).text()).toContain("None kept yet");
    const failed = mount(FilesHistoryMenu, { props: { open: true, entries: [], failed: true, restoreFailed: false } });
    expect(failed.get('[role="alert"]').text()).toContain("Could not read");
  });
});

describe("FilesComparingBanner", () => {
  it("names the version and offers restore and stop", async () => {
    const w = mount(FilesComparingBanner, { props: { at: ENTRY.at, failed: false, restoreFailed: false } });
    expect(w.text()).toContain(new Date(ENTRY.at).toLocaleString("en"));
    await w.get('[data-testid="files-comparing-restore"]').trigger("click");
    await w.get('[data-testid="files-comparing-stop"]').trigger("click");
    expect(w.emitted("restore")).toHaveLength(1);
    expect(w.emitted("stop")).toHaveLength(1);
  });
});

describe("FilesHistoryMenu closing", () => {
  it("asks to close on Escape and on a click outside it", async () => {
    const w = mount(FilesHistoryMenu, { props: { open: false, entries: [ENTRY], failed: false, restoreFailed: false }, attachTo: document.body });
    await w.setProps({ open: true });
    await w.get('[data-testid="files-history"]').trigger("keydown", { key: "Escape" });
    expect(w.emitted("close")).toHaveLength(1);
    document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    expect(w.emitted("close")).toHaveLength(2);
    w.unmount();
  });

  // Mounted already open — a conflict hides the menu and then clears — it still dismisses, and Escape
  // works wherever the focus is (a click does not focus a button in every browser).
  it("dismisses when mounted open, and on an Escape pressed anywhere", () => {
    const w = mount(FilesHistoryMenu, { props: { open: true, entries: [ENTRY], failed: false, restoreFailed: false }, attachTo: document.body });
    document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    const closes = w.emitted("close") ?? [];
    expect(closes).toHaveLength(2);
    // Unmounted, it stops listening on the window.
    const removed = vi.spyOn(window, "removeEventListener");
    w.unmount();
    expect(removed.mock.calls.map(([type]) => type)).toEqual(expect.arrayContaining(["pointerdown", "keydown"]));
    removed.mockRestore();
  });

  it("says on the banner when a restore did not land", () => {
    const w = mount(FilesComparingBanner, { props: { at: ENTRY.at, failed: true, restoreFailed: false } });
    expect(w.get('[role="alert"]').text()).toContain("Could not restore");
  });
});
