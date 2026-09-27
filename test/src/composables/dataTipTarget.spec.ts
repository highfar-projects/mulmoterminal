import { describe, it, expect, beforeEach } from "vitest";
import { findDataTip, isKeyboardFocus } from "../../../src/composables/dataTipTarget";

const build = (html: string): HTMLElement => {
  document.body.innerHTML = html;
  return document.body;
};
const byId = (id: string): Element => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`no #${id}`);
  return el;
};

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("findDataTip", () => {
  it("answers the element itself when it carries the tip", () => {
    build(`<button id="b" data-tip="Expand">x</button>`);
    expect(findDataTip(byId("b"))).toEqual({ anchor: byId("b"), text: "Expand" });
  });

  it("walks up from an icon inside the button", () => {
    build(`<button id="b" data-tip="Close"><span id="icon">close</span></button>`);
    expect(findDataTip(byId("icon"))?.anchor).toBe(byId("b"));
  });

  it("takes the nearest tip when two are nested", () => {
    build(`<div id="outer" data-tip="Row"><button id="inner" data-tip="Close"><span id="icon">x</span></button></div>`);
    expect(findDataTip(byId("icon"))?.text).toBe("Close");
  });

  it("trims the words", () => {
    build(`<button id="b" data-tip="  Expand \n">x</button>`);
    expect(findDataTip(byId("b"))?.text).toBe("Expand");
  });

  it.each([
    ["an empty tip", `<button id="b" data-tip="">x</button>`],
    ["a blank tip", `<button id="b" data-tip="   ">x</button>`],
    ["no tip at all", `<button id="b">x</button>`],
    ["only a title", `<button id="b" title="Expand">x</button>`],
  ])("answers null for %s", (_, html) => {
    build(html);
    expect(findDataTip(byId("b"))).toBeNull();
  });

  it("answers null for a blank tip even when an outer element has words", () => {
    build(`<div data-tip="Row"><button id="b" data-tip="">x</button></div>`);
    expect(findDataTip(byId("b"))).toBeNull();
  });

  it("answers null for a text node, the document, the window and nothing", () => {
    const body = build(`hello`);
    expect(findDataTip(body.firstChild)).toBeNull();
    expect(findDataTip(document)).toBeNull();
    expect(findDataTip(window)).toBeNull();
    expect(findDataTip(null)).toBeNull();
  });
});

describe("isKeyboardFocus", () => {
  it("is false for an element that is not focused", () => {
    build(`<button id="b">x</button>`);
    expect(isKeyboardFocus(byId("b"))).toBe(false);
  });

  it("is false rather than throwing when the selector is not understood", () => {
    const el = {
      matches: (): boolean => {
        throw new SyntaxError("unknown pseudo-class");
      },
    };
    expect(isKeyboardFocus(Object.assign(document.createElement("div"), el))).toBe(false);
  });
});
