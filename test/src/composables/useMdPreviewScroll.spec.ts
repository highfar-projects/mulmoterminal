import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { defineComponent, h, ref, type Ref } from "vue";
import { mount } from "@vue/test-utils";
import { useMdPreviewScroll } from "../../../src/composables/useMdPreviewScroll";
import { MD_PREVIEW_FROM_FRAME, MD_PREVIEW_FROM_HOST } from "../../../common/mdPreviewMessage";

// #2157. The preview document is opaque-origin, so the pane cannot read its scroll and cannot
// name it by origin either. Everything here is about the one thing left to check — WHICH WINDOW
// spoke — and about the answer the host owes a document that has just loaded.

/** A stand-in for the frame's `contentWindow`: identity is what the host checks, and `postMessage`
 *  is the only thing it ever calls on it. */
const fakeWindow = () => {
  const sent: unknown[] = [];
  const target = { postMessage: (data: unknown) => sent.push(data) };
  return { target, sent };
};

/** The token the pane gave the document; the reporter stamps every message with it (#2515). */
const TOKEN = "0123456789abcdef-wire";

const host = (
  frame: () => HTMLIFrameElement | null,
  scrollTop: Ref<number>,
  openLink: (href: string) => void = () => {},
  token: () => string | null = () => TOKEN,
) =>
  mount(
    defineComponent({
      setup() {
        useMdPreviewScroll(frame, scrollTop, openLink, token);
        return () => h("div");
      },
    }),
  );

/** Post as a window would: the host reads `source` off the event, which `window.dispatchEvent`
 *  will not set, so the event is built with it. */
const arrive = (source: unknown, data: unknown) => {
  // Stamped as the reporter stamps it, unless the case says otherwise.
  const stamped = typeof data === "object" && data !== null && !("token" in data) ? { ...data, token: TOKEN } : data;
  const event = new MessageEvent("message", { data: stamped });
  Object.defineProperty(event, "source", { value: source });
  window.dispatchEvent(event);
};

// The words the document's copy buttons carry, in the app's language (#2579).
const COPY_LABELS = { copy: "Copy", copied: "Copied", failed: "Copy failed" };

const scrolled = (scrollY: number) => ({ source: MD_PREVIEW_FROM_FRAME, kind: "scroll", scrollY });
const ready = { source: MD_PREVIEW_FROM_FRAME, kind: "ready" };

describe("useMdPreviewScroll", () => {
  let frame: { target: { postMessage: (data: unknown) => void }; sent: unknown[] };
  let scrollTop: Ref<number>;
  const iframe = () => ({ contentWindow: frame.target }) as unknown as HTMLIFrameElement;

  beforeEach(() => {
    frame = fakeWindow();
    scrollTop = ref(0);
  });

  it("follows the position its own frame reports", () => {
    host(iframe, scrollTop);
    arrive(frame.target, scrolled(317));
    expect(scrollTop.value).toBe(317);
  });

  // The document knows nothing when it loads — including after a reload the pane did not ask
  // for, which is what happens every time the file changes on disk. The host holds the place.
  it("answers a fresh document with the place it is holding", () => {
    scrollTop.value = 240;
    host(iframe, scrollTop);
    arrive(frame.target, ready);
    expect(frame.sent).toEqual([{ source: MD_PREVIEW_FROM_HOST, scrollY: 240, copyLabels: COPY_LABELS }]);
  });

  it("answers the top for a file nothing is remembered about", () => {
    host(iframe, scrollTop);
    arrive(frame.target, ready);
    expect(frame.sent).toEqual([{ source: MD_PREVIEW_FROM_HOST, scrollY: 0, copyLabels: COPY_LABELS }]);
  });

  // Two panes can be mounted at once — the Files view and the pane beside a zoomed cell — and
  // they hear each other's frames on the same window. The position of one must not become the
  // position of the other.
  it("ignores a message from a window that is not its frame", () => {
    const other = fakeWindow();
    host(iframe, scrollTop);
    arrive(other.target, scrolled(999));
    arrive(window, scrolled(888));
    expect(scrollTop.value).toBe(0);
    expect(other.sent).toEqual([]);
  });

  // The frame element outlives each document in it: a reload swaps `contentWindow`, and a
  // message posted by the document being replaced must not overwrite the place the new one is
  // about to be given.
  it("ignores the window its frame used to have", () => {
    const old = fakeWindow();
    let current = old;
    host(() => ({ contentWindow: current.target }) as unknown as HTMLIFrameElement, scrollTop);
    arrive(old.target, scrolled(100));
    current = fakeWindow();
    arrive(old.target, scrolled(900));
    expect(scrollTop.value).toBe(100);
  });

  it("ignores traffic that is not this document speaking", () => {
    host(iframe, scrollTop);
    arrive(frame.target, { source: "vite:hmr", kind: "scroll", scrollY: 500 });
    arrive(frame.target, { source: MD_PREVIEW_FROM_FRAME, kind: "scroll", scrollY: "500" });
    expect(scrollTop.value).toBe(0);
  });

  // A pane that has been torn down still has its listener on a window that outlives it.
  it("stops listening when the pane goes away", () => {
    const wrapper = host(iframe, scrollTop);
    wrapper.unmount();
    arrive(frame.target, scrolled(555));
    expect(scrollTop.value).toBe(0);
  });

  // The pane can be mounted before the frame is in the document at all (the preview is only
  // rendered once a file is open), and a message arriving then must not throw.
  it("survives a message with no frame to compare against", () => {
    host(() => null, scrollTop);
    expect(() => arrive(frame.target, scrolled(42))).not.toThrow();
    expect(scrollTop.value).toBe(0);
  });

  // #2259. The frame has no `allow-popups`, so it asks; the host opens it, isolated from the app.
  it("opens an external link its own frame asks for", () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    host(iframe, scrollTop);
    arrive(frame.target, { source: MD_PREVIEW_FROM_FRAME, kind: "navigate", href: "https://www.youtube.com/" });
    expect(open).toHaveBeenCalledWith("https://www.youtube.com/", "_blank", "noopener,noreferrer");
    open.mockRestore();
  });

  // #2268. A link to another file is handed on as written: only the pane knows which document it
  // was clicked in, and so what the path is relative to.
  it("hands a link to another file to the pane, opening no browser tab", () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const openLink = vi.fn();
    host(iframe, scrollTop, openLink);
    arrive(frame.target, { source: MD_PREVIEW_FROM_FRAME, kind: "open", href: "./b.md" });
    expect(openLink).toHaveBeenCalledWith("./b.md");
    expect(open).not.toHaveBeenCalled();
    open.mockRestore();
  });

  it("hands on nothing another window asks to open", () => {
    const openLink = vi.fn();
    host(iframe, scrollTop, openLink);
    arrive(fakeWindow().target, { source: MD_PREVIEW_FROM_FRAME, kind: "open", href: "./b.md" });
    expect(openLink).not.toHaveBeenCalled();
  });

  it("opens nothing another window asks for", () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    host(iframe, scrollTop);
    arrive(fakeWindow().target, { source: MD_PREVIEW_FROM_FRAME, kind: "navigate", href: "https://example.com/" });
    expect(open).not.toHaveBeenCalled();
    open.mockRestore();
  });

  // #2515. The frame is not enough: a page the document navigated its frame to speaks from the same
  // window, and it never had the token.
  it.each([
    ["another token", "ffffffffffffffff-other"],
    ["no token", null],
    ["a malformed token", "short"],
  ])("hears nothing carrying %s", (_label, token) => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const openLink = vi.fn();
    host(iframe, scrollTop, openLink);
    arrive(frame.target, { source: MD_PREVIEW_FROM_FRAME, kind: "navigate", href: "https://example.com/", token });
    arrive(frame.target, { source: MD_PREVIEW_FROM_FRAME, kind: "open", href: "./b.md", token });
    arrive(frame.target, { source: MD_PREVIEW_FROM_FRAME, kind: "scroll", scrollY: 99, token });
    expect(open).not.toHaveBeenCalled();
    expect(openLink).not.toHaveBeenCalled();
    expect(scrollTop.value).toBe(0);
    open.mockRestore();
  });

  it("hears nothing while the pane has no token to expect", () => {
    const openLink = vi.fn();
    host(iframe, scrollTop, openLink, () => null);
    arrive(frame.target, { source: MD_PREVIEW_FROM_FRAME, kind: "open", href: "./b.md", token: null });
    arrive(frame.target, { source: MD_PREVIEW_FROM_FRAME, kind: "open", href: "./b.md" });
    expect(openLink).not.toHaveBeenCalled();
  });
});

// #2579. A code block's copy button: the document has no origin to be granted the clipboard, so the
// host writes it and says whether it worked.
describe("useMdPreviewScroll — copy", () => {
  let frame: { target: { postMessage: (data: unknown) => void }; sent: unknown[] };
  const iframe = () => ({ contentWindow: frame.target }) as unknown as HTMLIFrameElement;
  const copyMessage = { source: MD_PREVIEW_FROM_FRAME, kind: "copy", text: "const a = 1;", block: 3 };
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  beforeEach(() => {
    frame = fakeWindow();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("writes the block's text and tells its button it worked", async () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    host(iframe, ref(0));
    arrive(frame.target, copyMessage);
    await settle();
    expect(writeText).toHaveBeenCalledWith("const a = 1;");
    expect(frame.sent).toEqual([{ source: MD_PREVIEW_FROM_HOST, copied: 3, ok: true }]);
  });

  it("tells the button when the clipboard refused", async () => {
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn(async () => Promise.reject(new Error("not focused"))) } });
    host(iframe, ref(0));
    arrive(frame.target, copyMessage);
    await settle();
    expect(frame.sent).toEqual([{ source: MD_PREVIEW_FROM_HOST, copied: 3, ok: false }]);
  });

  // Plain http from another machine: no Clipboard API at all.
  it("tells the button when there is no clipboard to write", async () => {
    vi.stubGlobal("navigator", {});
    host(iframe, ref(0));
    arrive(frame.target, copyMessage);
    await settle();
    expect(frame.sent).toEqual([{ source: MD_PREVIEW_FROM_HOST, copied: 3, ok: false }]);
  });

  it("copies nothing another window asks for", async () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    host(iframe, ref(0));
    arrive(fakeWindow().target, copyMessage);
    await settle();
    expect(writeText).not.toHaveBeenCalled();
  });
});
