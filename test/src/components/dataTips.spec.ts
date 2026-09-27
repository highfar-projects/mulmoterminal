// `data-tip` end to end: a pointer arriving on the element opens the shared hover tip with its
// words, at once, and each way of leaving closes it.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { nextTick } from "vue";
import HoverTip from "../../../src/components/HoverTip.vue";
import { installDataTips } from "../../../src/composables/useDataTips";
import { hideHoverTip, showHoverTip, HOVER_TIP_ID } from "../../../src/composables/useHoverTip";

const tipText = (): string | null => document.querySelector('[data-testid="hover-tip"]')?.textContent ?? null;
const el = (id: string): HTMLElement => {
  const found = document.getElementById(id);
  if (!found) throw new Error(`no #${id}`);
  return found;
};
const pointer = (type: string, target: Element, init: MouseEventInit & { pointerType?: string } = {}): void => {
  const event = new MouseEvent(type, { bubbles: true, ...init });
  Object.defineProperty(event, "pointerType", { value: init.pointerType ?? "mouse" });
  target.dispatchEvent(event);
};

let tip: VueWrapper;
let uninstall: () => void;

beforeEach(() => {
  hideHoverTip();
  document.body.innerHTML = `
    <div id="row">
      <button id="expand" data-tip="Expand"><span id="expand-icon">open_in_full</span></button>
      <button id="close" data-tip="Close" aria-describedby="own-help">x</button>
      <button id="stop" data-tip="Nothing running to stop" disabled>stop</button>
      <span id="plain">text</span>
      <span id="chip">chip</span>
    </div>`;
  tip = mount(HoverTip);
  uninstall = installDataTips();
});

afterEach(() => {
  uninstall();
  tip.unmount();
});

describe("hovering an element with data-tip", () => {
  it("opens the tip with its words, with no delay", async () => {
    pointer("pointerover", el("expand-icon"));
    await nextTick();
    expect(tipText()).toBe("Expand");
  });

  it("opens on a disabled button, which is often explaining why it is disabled", async () => {
    pointer("pointerover", el("stop"));
    await nextTick();
    expect(tipText()).toBe("Nothing running to stop");
  });

  it("points the anchor at the tip while it is up, and stops when it closes", async () => {
    pointer("pointerover", el("expand"));
    await nextTick();
    expect(el("expand").getAttribute("aria-describedby")).toBe(HOVER_TIP_ID);

    pointer("pointerover", el("plain"));
    await nextTick();
    expect(el("expand").hasAttribute("aria-describedby")).toBe(false);
  });

  it("leaves an anchor's own aria-describedby alone", async () => {
    pointer("pointerover", el("close"));
    await nextTick();
    expect(tipText()).toBe("Close");
    pointer("pointerover", el("plain"));
    await nextTick();
    expect(el("close").getAttribute("aria-describedby")).toBe("own-help");
  });

  it("moves straight from one anchor to the next", async () => {
    pointer("pointerover", el("expand"));
    pointer("pointerover", el("close"));
    await nextTick();
    expect(tipText()).toBe("Close");
  });

  it("closes on an element with no tip", async () => {
    pointer("pointerover", el("expand"));
    await nextTick();
    pointer("pointerover", el("plain"));
    await nextTick();
    expect(tipText()).toBeNull();
  });

  it("closes when the pointer leaves the window", async () => {
    pointer("pointerover", el("expand"));
    await nextTick();
    pointer("pointerout", el("expand"), { relatedTarget: null });
    await nextTick();
    expect(tipText()).toBeNull();
  });

  it("stays open when the pointer moves between the anchor's own children", async () => {
    pointer("pointerover", el("expand"));
    await nextTick();
    pointer("pointerout", el("expand"), { relatedTarget: el("expand-icon") });
    pointer("pointerover", el("expand-icon"));
    await nextTick();
    expect(tipText()).toBe("Expand");
  });

  it("wraps long words and keeps line breaks, where a chip heading stays on one line", async () => {
    el("expand").setAttribute("data-tip", "first line\nsecond line");
    pointer("pointerover", el("expand"));
    await nextTick();
    const head = document.querySelector('[data-testid="hover-tip-head"]');
    expect(head?.textContent).toBe("first line\nsecond line");
    expect(head?.className).toContain("whitespace-pre-line");
    expect(head?.className).not.toContain("whitespace-nowrap");
  });

  it("ignores touch, where a tap would open and close it in one gesture", async () => {
    pointer("pointerover", el("expand"), { pointerType: "touch" });
    await nextTick();
    expect(tipText()).toBeNull();
  });
});

describe("after a click closes the tip", () => {
  it("does not reopen while the pointer stays on the same anchor, as title never does", async () => {
    pointer("pointerover", el("expand"));
    await nextTick();
    window.dispatchEvent(new Event("pointerdown"));
    await nextTick();
    expect(tipText()).toBeNull();

    pointer("pointerover", el("expand-icon"));
    await nextTick();
    expect(tipText()).toBeNull();
  });

  it("opens again once the pointer has been somewhere else", async () => {
    pointer("pointerover", el("expand"));
    await nextTick();
    window.dispatchEvent(new Event("pointerdown"));
    await nextTick();
    pointer("pointerover", el("plain"));
    pointer("pointerover", el("expand"));
    await nextTick();
    expect(tipText()).toBe("Expand");
  });
});

describe("inside a plugin's shadow root", () => {
  const shadowPin = (): Element => {
    const shadow = el("row").attachShadow({ mode: "open" });
    shadow.innerHTML = `<button id="pin" data-tip="Pin to toolbar"><span id="pin-icon">push_pin</span></button>`;
    const pin = shadow.getElementById("pin-icon");
    if (!pin) throw new Error("no pin in the shadow root");
    return pin;
  };

  it("opens for a button the document listener only sees as the shadow host", async () => {
    pointer("pointerover", shadowPin(), { composed: true });
    await nextTick();
    expect(tipText()).toBe("Pin to toolbar");
  });

  it("does not point the anchor at the tip, since an id reference cannot leave the shadow root", async () => {
    const icon = shadowPin();
    pointer("pointerover", icon, { composed: true });
    await nextTick();
    expect(icon.parentElement?.hasAttribute("aria-describedby")).toBe(false);
  });
});

describe("sharing the tip with the chips", () => {
  it("does not close a tip another anchor opened", async () => {
    showHoverTip({ currentTarget: el("chip") } as unknown as Event, [{ head: "PR #1" }], 999);
    await nextTick();
    pointer("pointerover", el("plain"));
    await nextTick();
    expect(tipText()).toBe("PR #1");
  });

  it("lets a chip take over, and releases the anchor it had", async () => {
    pointer("pointerover", el("expand"));
    await nextTick();
    showHoverTip({ currentTarget: el("chip") } as unknown as Event, [{ head: "PR #1" }], 999);
    await nextTick();
    expect(tipText()).toBe("PR #1");
    expect(el("expand").hasAttribute("aria-describedby")).toBe(false);
  });
});

describe("focus", () => {
  // jsdom answers `:focus-visible` as plain `:focus`, so the browser's verdict is set per test.
  const focusBy = (keyboard: boolean): void => {
    const button = el("expand");
    const matches = button.matches.bind(button);
    Object.defineProperty(button, "matches", { value: (selector: string): boolean => (selector === ":focus-visible" ? keyboard : matches(selector)) });
    button.focus();
  };

  it("opens on keyboard focus", async () => {
    focusBy(true);
    await nextTick();
    expect(tipText()).toBe("Expand");
  });

  it("does not open on a focus that followed a click", async () => {
    focusBy(false);
    await nextTick();
    expect(tipText()).toBeNull();
  });

  it("closes the tip its anchor opened when that anchor loses focus", async () => {
    pointer("pointerover", el("expand"));
    await nextTick();
    el("expand").dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    await nextTick();
    expect(tipText()).toBeNull();
  });
});

describe("uninstalling", () => {
  it("closes an open tip and stops listening", async () => {
    pointer("pointerover", el("expand"));
    await nextTick();
    uninstall();
    await nextTick();
    expect(tipText()).toBeNull();

    pointer("pointerover", el("close"));
    await nextTick();
    expect(tipText()).toBeNull();
    uninstall = () => {};
  });
});
