import { describe, it, expect, beforeEach } from "vitest";
import { eventOrigin, findDataTip, isKeyboardFocus } from "../../../src/composables/dataTipTarget";

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

// A plugin view renders into an open shadow root; the button inside it is what the pointer is on.
const shadowButton = (hostHtml: string, buttonHtml: string): { host: Element; button: Element } => {
  build(hostHtml);
  const host = byId("host");
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = buttonHtml;
  const button = shadow.getElementById("inner");
  if (!button) throw new Error("no #inner in the shadow root");
  return { host, button };
};

describe("findDataTip across a shadow root", () => {
  it("finds a tip inside the shadow root", () => {
    const { button } = shadowButton(`<div id="host"></div>`, `<button id="inner" data-tip="Pin to toolbar">x</button>`);
    expect(findDataTip(button)).toEqual({ anchor: button, text: "Pin to toolbar" });
  });

  it("climbs out through the host to a tip in the page", () => {
    const { host, button } = shadowButton(`<div id="host" data-tip="Collection">`, `<button id="inner">x</button>`);
    expect(findDataTip(button)).toEqual({ anchor: host, text: "Collection" });
  });

  it("answers null when neither side carries a tip", () => {
    const { button } = shadowButton(`<div id="host"></div>`, `<button id="inner">x</button>`);
    expect(findDataTip(button)).toBeNull();
  });
});

describe("eventOrigin", () => {
  it("answers the element inside a shadow root, where a document listener sees only the host", () => {
    const { host, button } = shadowButton(`<div id="host"></div>`, `<button id="inner">x</button>`);
    const seen: Array<{ target: EventTarget | null; origin: Element | null }> = [];
    const listener = (event: Event): void => {
      seen.push({ target: event.target, origin: eventOrigin(event) });
    };
    document.addEventListener("pointerover", listener);
    button.dispatchEvent(new MouseEvent("pointerover", { bubbles: true, composed: true }));
    document.removeEventListener("pointerover", listener);
    expect(seen).toEqual([{ target: host, origin: button }]);
  });

  it("answers the parent of a text node", () => {
    const body = build(`<span id="s">hello</span>`);
    const text = body.querySelector("#s")?.firstChild;
    if (!text) throw new Error("no text node");
    const origins: Array<Element | null> = [];
    body.addEventListener("custom", (event) => origins.push(eventOrigin(event)));
    text.dispatchEvent(new Event("custom", { bubbles: true }));
    expect(origins).toEqual([byId("s")]);
  });

  it("answers null for an event dispatched on the window", () => {
    const origins: Array<Element | null> = [];
    const listener = (event: Event): void => {
      origins.push(eventOrigin(event));
    };
    window.addEventListener("custom", listener);
    window.dispatchEvent(new Event("custom"));
    window.removeEventListener("custom", listener);
    expect(origins).toEqual([null]);
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
