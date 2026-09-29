import { describe, it, expect, afterEach } from "vitest";
import { appKeyAnywhere, opensPaletteAnywhere } from "../../../src/composables/usePaletteKeyAnywhere";
import { setActiveKeymap } from "../../../src/composables/activeKeymap";

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
