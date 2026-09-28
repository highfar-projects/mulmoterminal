import { describe, it, expect, afterEach } from "vitest";
import { opensPaletteAnywhere } from "../../../src/composables/usePaletteKeyAnywhere";
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
