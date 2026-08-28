import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { copyOutcomeFor, copyOutcomeMessage, type CopyOutcome } from "../../../src/components/codeBlockCopy";

// #865. Three of the four outcomes are not errors, and the value of separating them is that
// each needs a different sentence — "that reply had no code" and "this transcript is too big to
// read" are both silence from the button otherwise, and only one of them is a limit.
describe("copyOutcomeFor", () => {
  it("returns the last fenced block's body", () => {
    const reply = "here you go\n\n```ts\nconst a = 1;\n```\n\nand that's it";
    expect(copyOutcomeFor({ reply })).toEqual({ kind: "ok", text: "const a = 1;", lang: "ts" });
  });

  it("keeps the block's own indentation and blank lines", () => {
    const body = "function f() {\n  if (x) {\n\n    return 1;\n  }\n}";
    expect(copyOutcomeFor({ reply: "```js\n" + body + "\n```" })).toMatchObject({ kind: "ok", text: body });
  });

  it("reports no-code for a reply that is only prose", () => {
    expect(copyOutcomeFor({ reply: "I changed three files and pushed." })).toEqual({ kind: "no-code" });
  });

  it.each([
    ["a session with nothing on disk yet", null],
    ["an empty reply", ""],
  ])("reports no-turn for %s", (_case, reply) => {
    expect(copyOutcomeFor({ reply })).toEqual({ kind: "no-turn" });
  });
});

describe("copyOutcomeMessage", () => {
  // Every outcome must say something. A missing case would surface as an empty toast, which is
  // exactly the "the button does nothing" complaint this feature is meant to avoid.
  it.each<CopyOutcome>([{ kind: "ok", text: "x", lang: null }, { kind: "no-code" }, { kind: "no-turn" }])("has a message for %o", (outcome) => {
    expect(copyOutcomeMessage(outcome).length).toBeGreaterThan(0);
  });

  it("does not call any of them a failure — none is something a retry fixes", () => {
    const messages = (["no-code", "no-turn"] as const).map((kind) => copyOutcomeMessage({ kind }));
    messages.forEach((m) => expect(m.toLowerCase()).not.toContain("error"));
  });
});

// The fallback dialog's contract, after Codex flagged it (#995 review). Asserted on the
// RENDERED dialog rather than on the source text: what matters is what a screen reader and the
// keyboard actually meet.
//
// The pattern is the app's other modals (TimelineOverlay, SettingsModal): role + aria-modal on
// the BOX (the review found them on the backdrop), and both Escape and the Tab trap handled at
// the DOCUMENT — bound to the overlay element instead, they fire only while focus is already
// inside it, which reads as "Escape sometimes works".
//
// The trap has to see the `textarea`: `trapTabKey`'s default selector is buttons only, which
// would wrap Tab onto Close and leave the code itself unreachable from the keyboard.
describe("the manual-copy dialog", () => {
  const REPLY = "here:\n\n```ts\nconst a = 1;\n```";

  // No Clipboard API is exactly the situation the dialog exists for: any address that is not
  // https or localhost, i.e. reaching this app from a phone.
  const withoutClipboard = async () => {
    vi.stubGlobal("navigator", { ...navigator, clipboard: undefined });
    vi.doMock("../../../src/composables/useHandoff", () => ({
      fetchLastTurn: async () => ({ prompt: null, reply: REPLY, text: "" }),
    }));
    const { default: CopyCodeBlock } = await import("../../../src/components/CopyCodeBlock.vue");
    const w = mount(CopyCodeBlock, { props: { sessionId: "s", cwd: "/x", agent: "claude" as const } });
    await w.find("button").trigger("click");
    await flushPromises();
    await new Promise((r) => requestAnimationFrame(r));
    return w;
  };

  beforeEach(() => {
    vi.resetModules();
    document.body.innerHTML = "";
  });
  afterEach(() => vi.unstubAllGlobals());

  it("marks the BOX as the modal, not the backdrop", async () => {
    const w = await withoutClipboard();
    const dialog = document.body.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.getAttribute("aria-modal")).toBe("true");
    expect(dialog?.getAttribute("tabindex")).toBe("-1");
    // The backdrop is the element that fills the screen; the dialog must not be it.
    expect(dialog?.className).not.toContain("inset-0");
    w.unmount();
  });

  it("puts the text in, selected, so one key copies it", async () => {
    const w = await withoutClipboard();
    const box = document.body.querySelector<HTMLTextAreaElement>('[data-testid="copy-block-text"]');
    expect(box?.value).toBe("const a = 1;");
    expect(document.activeElement).toBe(box);
    w.unmount();
  });

  it("keeps Tab inside the dialog, textarea included", async () => {
    const w = await withoutClipboard();
    const dialog = document.body.querySelector<HTMLElement>('[role="dialog"]');
    const text = dialog?.querySelector<HTMLTextAreaElement>('[data-testid="copy-block-text"]');
    const close = dialog?.querySelector<HTMLButtonElement>("button");
    if (!text || !close) throw new Error("the dialog is missing one of its focus stops");

    // Forward off the last stop wraps to the first — which must be the textarea, not Close.
    close.focus();
    const forward = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    document.dispatchEvent(forward);
    expect(document.activeElement).toBe(text);
    expect(forward.defaultPrevented).toBe(true);

    // …and backward off the first wraps to the last, so focus never reaches the page behind.
    text.focus();
    const back = new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true });
    document.dispatchEvent(back);
    expect(document.activeElement).toBe(close);
    w.unmount();
  });

  it("closes on Escape raised at the document, with focus anywhere", async () => {
    const w = await withoutClipboard();
    const active = document.activeElement;
    if (active instanceof HTMLElement) active.blur();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await flushPromises();
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    w.unmount();
  });
});

// #1895. `TerminalCell` styles this button by passing CELL_BTN — the same class every other button
// in that toolbar row carries — and nothing asserted that it arrived, which is why a dropped class
// survived from the day the Teleport was added.
//
// Every assertion here is on the BUTTON and not on the root, and that is the point rather than a
// detail: the repair the issue first suggested (fold the Teleport in for a single root) silences
// the Vue warning and puts the class on the wrapping `<span>`, leaving the button exactly as
// unstyled as before — `.cell-btn` is a marker with no CSS rule of its own. Measured both ways
// before choosing. A spec written against `wrapper.classes()` would have passed that repair.
describe("the class the caller styles this button with", () => {
  beforeEach(() => {
    vi.resetModules();
    document.body.innerHTML = "";
  });

  const mounted = async (attrs: Record<string, string>) => {
    const { default: CopyCodeBlock } = await import("../../../src/components/CopyCodeBlock.vue");
    return mount(CopyCodeBlock, { props: { sessionId: "s", cwd: "/x", agent: "claude" as const }, attrs });
  };

  // NOT `wrapper.element`. For a multi-root component that is test-utils' own `<div data-v-app>`
  // container, which never carries the class — so an assertion against it passes whatever the
  // component does. Both wrapper checks below were written that way first and were vacuous.
  const rootOf = (w: Awaited<ReturnType<typeof mounted>>): HTMLElement => {
    const root = (w.element as HTMLElement).firstElementChild;
    if (!(root instanceof HTMLElement)) throw new Error("the component rendered no element root");
    return root;
  };

  it("reaches the button, which is the element it describes", async () => {
    const w = await mounted({ class: "h-[26px] w-7 bg-transparent" });
    expect(w.find("button").classes()).toEqual(expect.arrayContaining(["h-[26px]", "w-7", "bg-transparent"]));
  });

  it("does not land on the wrapper instead — that looks fixed and is not", async () => {
    const w = await mounted({ class: "bg-transparent" });
    expect(rootOf(w).classList.contains("bg-transparent")).toBe(false);
  });

  it("keeps the `cell-btn` marker, which other code selects on", async () => {
    const w = await mounted({ class: "bg-transparent" });
    expect(w.find("button").classes()).toContain("cell-btn");
  });

  // The warning is the symptom rather than the defect, but it fires once per agent cell that
  // mounts, so a console full of it is how anyone finds this at all.
  it("mounts without Vue complaining that it could not inherit the attribute", async () => {
    const warnings: string[] = [];
    const warn = vi.spyOn(console, "warn").mockImplementation((...args: unknown[]) => void warnings.push(String(args[0])));
    await mounted({ class: "bg-transparent" });
    expect(warnings.filter((w) => w.includes("Extraneous non-props attributes"))).toEqual([]);
    warn.mockRestore();
  });

  // The wrapper earns its place by positioning the transient note, so it must stay a positioned
  // box even though it is no longer what the class lands on.
  it("leaves the wrapper positioned, which the note is placed against", async () => {
    const w = await mounted({ class: "bg-transparent" });
    expect(rootOf(w).classList.contains("relative")).toBe(true);
  });
});
