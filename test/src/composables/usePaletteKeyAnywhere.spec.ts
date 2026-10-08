import { describe, it, expect, afterEach, vi } from "vitest";
import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";
const { runAppAction } = vi.hoisted(() => ({ runAppAction: vi.fn(() => true) }));
vi.mock("../../../src/composables/runAppAction", () => ({ runAppAction }));

import { appKeyAnywhere, opensPaletteAnywhere, usePaletteKeyAnywhere } from "../../../src/composables/usePaletteKeyAnywhere";
import { closeCommandPalette, paletteOpen } from "../../../src/composables/commandPalette";
import { setActiveKeymap } from "../../../src/composables/activeKeymap";
import { provideFilesScreenHost } from "../../../src/composables/filesScreenHost";

// #2441. Off the grid, the palette's own key opens it — unless the grid is the one answering, or the
// key is being typed into a field.
const keydown = (key: string, target: HTMLElement = document.body): KeyboardEvent => {
  const e = new KeyboardEvent("keydown", { key, bubbles: true });
  Object.defineProperty(e, "target", { value: target });
  return e;
};

afterEach(() => setActiveKeymap(null));

describe("opensPaletteAnywhere", () => {
  it("opens on the palette's key when the grid does not have the keyboard", () => {
    setActiveKeymap({ "command-palette": "F1" });
    expect(opensPaletteAnywhere(keydown("F1"), false)).toBe(true);
  });

  it("leaves the key to the grid when the grid has the keyboard", () => {
    setActiveKeymap({ "command-palette": "F1" });
    expect(opensPaletteAnywhere(keydown("F1"), true)).toBe(false);
  });

  it("leaves a key typed into a field alone, and ignores other keys", () => {
    setActiveKeymap({ "command-palette": "F1" });
    expect(opensPaletteAnywhere(keydown("F1", document.createElement("input")), false)).toBe(false);
    expect(opensPaletteAnywhere(keydown("F2"), false)).toBe(false);
  });

  // The Files screen's editor is a contenteditable, not an input: a key typed there is text.
  it("leaves a key typed into an editor alone, inside it or on it", () => {
    setActiveKeymap({ "command-palette": "F1" });
    const editor = document.createElement("div");
    editor.setAttribute("contenteditable", "true");
    const line = document.createElement("span");
    editor.append(line);
    expect(opensPaletteAnywhere(keydown("F1", editor), false)).toBe(false);
    expect(opensPaletteAnywhere(keydown("F1", line), false)).toBe(false);
    const readOnly = document.createElement("div");
    readOnly.setAttribute("contenteditable", "false");
    expect(opensPaletteAnywhere(keydown("F1", readOnly), false)).toBe(true);
  });

  it("does nothing with no binding", () => {
    expect(opensPaletteAnywhere(keydown("F1"), false)).toBe(false);
  });
});

// #2639. The toolbar's operations work from their key on every screen, under the same conditions.
describe("appKeyAnywhere", () => {
  it("names the toolbar operation a key is bound to, off the grid", () => {
    setActiveKeymap({ "screen-wiki": "F7", "sound-toggle": "F8" });
    expect(appKeyAnywhere(keydown("F7"), false)).toBe("screen-wiki");
    expect(appKeyAnywhere(keydown("F8"), false)).toBe("sound-toggle");
  });

  it("leaves it to the grid when the grid has the keyboard, and to a field being typed in", () => {
    setActiveKeymap({ "screen-wiki": "F7" });
    expect(appKeyAnywhere(keydown("F7"), true)).toBeNull();
    expect(appKeyAnywhere(keydown("F7", document.createElement("input")), false)).toBeNull();
  });

  it("takes no grid action off the grid", () => {
    setActiveKeymap({ "zoom-toggle": "F7" });
    expect(appKeyAnywhere(keydown("F7"), false)).toBeNull();
  });
});

// The listener itself, off the grid: a bound key runs its action and is claimed, so it reaches
// neither the page nor the terminal underneath; an unbound key is left alone.
describe("usePaletteKeyAnywhere", () => {
  const mountHook = () =>
    mount(
      defineComponent({
        setup() {
          usePaletteKeyAnywhere();
          return () => h("div");
        },
      }),
    );
  const pressOnWindow = (key: string): KeyboardEvent => {
    const e = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
    window.dispatchEvent(e);
    return e;
  };

  it("runs a toolbar operation from its key and claims the key", () => {
    runAppAction.mockClear();
    setActiveKeymap({ "screen-wiki": "F7" });
    const w = mountHook();
    const e = pressOnWindow("F7");
    expect(runAppAction).toHaveBeenCalledWith("screen-wiki");
    expect(e.defaultPrevented).toBe(true);
    w.unmount();
  });

  it("opens the palette from its key, and leaves an unbound key alone", () => {
    runAppAction.mockClear();
    setActiveKeymap({ "command-palette": "F1" });
    const w = mountHook();
    pressOnWindow("F1");
    expect(paletteOpen.value).toBe(true);
    const other = pressOnWindow("F9");
    expect(other.defaultPrevented).toBe(false);
    expect(runAppAction).not.toHaveBeenCalled();
    closeCommandPalette();
    w.unmount();
  });
});

// #2655. On the full-screen Files view the `files-*` keys are its own — inside its editor too, as
// beside a grid cell — and they are nobody's when that view is not up.
describe("appKeyAnywhere on the Files view", () => {
  afterEach(() => filesHost.withdraw());
  const filesHost = { withdraw: () => {} };
  const openFilesView = (open: boolean) => {
    filesHost.withdraw = provideFilesScreenHost({ open: () => open, run: () => {} });
  };

  it("takes a files key while the view is up, even inside its editor", () => {
    setActiveKeymap({ "files-find": "F7" });
    openFilesView(true);
    const editor = document.createElement("div");
    editor.setAttribute("contenteditable", "true");
    expect(appKeyAnywhere(keydown("F7"), false)).toBe("files-find");
    expect(appKeyAnywhere(keydown("F7", editor), false)).toBe("files-find");
  });

  it("leaves it alone when the view is not up, and never takes insert-selection", () => {
    setActiveKeymap({ "files-find": "F7", "files-insert-selection": "F8" });
    openFilesView(false);
    expect(appKeyAnywhere(keydown("F7"), false)).toBeNull();
    filesHost.withdraw();
    openFilesView(true);
    expect(appKeyAnywhere(keydown("F8"), false)).toBeNull();
  });
});
