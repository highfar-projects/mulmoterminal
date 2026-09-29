import { describe, it, expect } from "vitest";
import { isPreviewToken, MAX_COPY_CHARS, MD_PREVIEW_FROM_FRAME, MD_PREVIEW_FROM_HOST, mdPreviewFrameMessage } from "../../common/mdPreviewMessage";

// #2157. What the preview document posts arrives on the same `message` listener as everything
// else the app hears, from a document whose origin is the string "null" and identifies nobody.
// The host checks WHICH WINDOW sent it; this is the check on what was sent.

const frame = (over: Record<string, unknown>) => ({ source: MD_PREVIEW_FROM_FRAME, ...over });

// #2579. A code block's copy: the text and which block, so the answer reaches its button.
describe("mdPreviewFrameMessage — copy", () => {
  it("reads a block's text and index", () => {
    expect(mdPreviewFrameMessage(frame({ kind: "copy", text: "a\nb", block: 2 }))).toEqual({ token: null, kind: "copy", text: "a\nb", block: 2 });
  });

  it("keeps an empty block", () => {
    expect(mdPreviewFrameMessage(frame({ kind: "copy", text: "", block: 0 }))).toEqual({ token: null, kind: "copy", text: "", block: 0 });
  });

  it.each([
    ["no text", { block: 0 }],
    ["text that is not a string", { text: 1, block: 0 }],
    ["a negative block", { text: "a", block: -1 }],
    ["a fractional block", { text: "a", block: 1.5 }],
    ["a block that is not a number", { text: "a", block: "0" }],
    ["text past the cap", { text: "x".repeat(MAX_COPY_CHARS + 1), block: 0 }],
  ])("refuses %s", (_case, body) => {
    expect(mdPreviewFrameMessage(frame({ kind: "copy", ...body }))).toBeNull();
  });
});

describe("mdPreviewFrameMessage", () => {
  it("reads a document announcing that it can be scrolled", () => {
    expect(mdPreviewFrameMessage(frame({ kind: "ready" }))).toEqual({ token: null, kind: "ready" });
  });

  it("reads a reported position", () => {
    expect(mdPreviewFrameMessage(frame({ kind: "scroll", scrollY: 420 }))).toEqual({ token: null, kind: "scroll", scrollY: 420 });
  });

  it("keeps the top of a document as a position like any other", () => {
    expect(mdPreviewFrameMessage(frame({ kind: "scroll", scrollY: 0 }))).toEqual({ token: null, kind: "scroll", scrollY: 0 });
  });

  // The window carries other traffic — Vite's HMR, plugin frames, anything an extension posts.
  it.each([[{ kind: "scroll", scrollY: 1 }], [{ source: MD_PREVIEW_FROM_HOST, scrollY: 1 }], [{ source: "other", kind: "ready" }]])(
    "ignores %j, which is not this document speaking",
    (data) => {
      expect(mdPreviewFrameMessage(data)).toBeNull();
    },
  );

  it.each([[null], [undefined], ["ready"], [7], [[MD_PREVIEW_FROM_FRAME]]])("ignores %j, which is not a message at all", (data) => {
    expect(mdPreviewFrameMessage(data)).toBeNull();
  });

  it("ignores a kind it has no meaning for", () => {
    expect(mdPreviewFrameMessage(frame({ kind: "scrollTo", scrollY: 10 }))).toBeNull();
  });

  // A position that is not a number would be stored and handed back to `scrollTo`, which reads
  // anything it cannot use as 0 — so the reader silently loses their place rather than the
  // message being refused.
  it.each([[undefined], ["100"], [null], [Number.NaN], [Number.POSITIVE_INFINITY], [{}]])("refuses %j as a position", (scrollY) => {
    expect(mdPreviewFrameMessage(frame({ kind: "scroll", scrollY }))).toBeNull();
  });

  // Nothing is above the top of a document; a negative offset can only come from something that
  // is not the reporter, and it would read as "the position was forgotten".
  it("refuses a position above the top of the document", () => {
    expect(mdPreviewFrameMessage(frame({ kind: "scroll", scrollY: -1 }))).toBeNull();
  });

  // #2259. The host opens what this lets through with `window.open`, and the document is a file
  // nobody sanitised — so only an absolute http(s) URL is a link to follow.
  it.each([["https://www.youtube.com/watch?v=x"], ["http://example.com/a b"]])("accepts %s to open", (href) => {
    expect(mdPreviewFrameMessage(frame({ kind: "navigate", href }))).toEqual({ token: null, kind: "navigate", href: new URL(href).href });
  });

  it.each([["javascript:alert(1)"], ["file:///etc/passwd"], ["data:text/html,x"], ["docs/a.md"], ["#top"], [""], [7], [undefined]])(
    "refuses %j as a link to open",
    (href) => {
      expect(mdPreviewFrameMessage(frame({ kind: "navigate", href }))).toBeNull();
    },
  );

  // #2268. A link to another file is passed on as written; what it names is decided by the pane,
  // which knows the document (previewLinkTarget), and nothing here reaches `window.open`.
  it.each([["./b.md"], ["../README.md"], ["my%20file.md#top"]])("passes %s on as a file to open", (href) => {
    expect(mdPreviewFrameMessage(frame({ kind: "open", href }))).toEqual({ token: null, kind: "open", href });
  });

  it.each([[""], [7], [undefined], [null]])("refuses %j as a file to open", (href) => {
    expect(mdPreviewFrameMessage(frame({ kind: "open", href }))).toBeNull();
  });
});

// #2515. Every message carries the token its document was served with; the host compares it.
describe("the preview token", () => {
  const TOKEN = "0123456789abcdef-token_x";

  it("is read from a message that carries a well-formed one", () => {
    expect(mdPreviewFrameMessage({ source: MD_PREVIEW_FROM_FRAME, kind: "ready", token: TOKEN })).toEqual({ kind: "ready", token: TOKEN });
  });

  it.each([[undefined], [null], [""], ["short"], ["has space inside x"], ["<script>alert(1)</script>xx"], [42]])("reads %j as no token", (token) => {
    expect(mdPreviewFrameMessage({ source: MD_PREVIEW_FROM_FRAME, kind: "ready", token })?.token).toBeNull();
  });

  it("accepts only what a host could mint", () => {
    expect([crypto.randomUUID(), "a".repeat(16), "A-z_0".repeat(12).slice(0, 64)].every(isPreviewToken)).toBe(true);
    expect(["a".repeat(15), "a".repeat(65), 'a"b'.repeat(8), "</script>".repeat(3)].some(isPreviewToken)).toBe(false);
  });
});
