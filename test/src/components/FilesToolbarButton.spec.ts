import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import FilesToolbarButton from "../../../src/components/FilesToolbarButton.vue";

// The Files pane's icon buttons, extracted from FilesPane because the same utility run was written
// out once per button (#2140). An extraction is only worth making if it preserves behaviour, and
// this one nearly did not: the source had `@pointerdown.stop` on exactly ONE of the four buttons,
// and giving it to all of them would have left the finder open when "reload" or "close" is clicked.

const mountButton = (props: Record<string, unknown> = {}) =>
  mount(FilesToolbarButton, { props: { icon: "search", label: "Find a file", ...props }, attachTo: document.body });

describe("FilesToolbarButton", () => {
  it("names itself for a screen reader, since its only content is a hidden glyph", () => {
    const w = mountButton();
    expect(w.attributes("aria-label")).toBe("Find a file");
    expect(w.attributes("title")).toBe("Find a file");
    expect(w.find("span").attributes("aria-hidden")).toBe("true");
    expect(w.find("span").text()).toBe("search");
    w.unmount();
  });

  it("emits click", async () => {
    const w = mountButton();
    await w.trigger("click");
    expect(w.emitted("click")).toHaveLength(1);
    w.unmount();
  });

  // THE DISTINCTION. A panel closes itself on a pointerdown anywhere outside it, so the button that
  // OPENS one has to stop the event that opened it — and every other button must not, or clicking
  // "reload" while a panel is up would leave the panel up.
  describe("whether the pointerdown reaches window", () => {
    const pointerDownSeenByWindow = async (props: Record<string, unknown>): Promise<boolean> => {
      const seen = vi.fn();
      window.addEventListener("pointerdown", seen);
      const w = mountButton(props);
      await w.trigger("pointerdown");
      window.removeEventListener("pointerdown", seen);
      w.unmount();
      return seen.mock.calls.length > 0;
    };

    it("stops it for a button that opens a panel", async () => {
      expect(await pointerDownSeenByWindow({ opensAPanel: true })).toBe(false);
    });

    it("lets it through for every other button — which is the default", async () => {
      expect(await pointerDownSeenByWindow({})).toBe(true);
      expect(await pointerDownSeenByWindow({ opensAPanel: false })).toBe(true);
    });
  });
});
