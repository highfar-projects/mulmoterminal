import { describe, it, expect } from "vitest";
import { checkClosedNotice, checkSummary, isPaneCommand, parseCheckRequest, parseTarget, MAX_CHECK_ITEMS } from "../../common/paneCommand";

describe("parseTarget", () => {
  it("defaults the view to the editor and keeps a positive whole line", () => {
    expect(parseTarget({ path: "a.md" })).toEqual({ path: "a.md", view: "editor" });
    expect(parseTarget({ path: " a.md ", view: "canvas", line: 3 })).toEqual({ path: "a.md", view: "canvas", line: 3 });
    expect(parseTarget({ path: "a.md", line: 0 })).toEqual({ path: "a.md", view: "editor" });
    expect(parseTarget({ path: "a.md", line: 2.5 })).toEqual({ path: "a.md", view: "editor" });
  });

  it.each([[null], ["a.md"], [{}], [{ path: "" }], [{ path: "   " }], [{ path: 3 }], [{ path: "a.md", view: "window" }]])("refuses %j", (raw) => {
    expect(parseTarget(raw)).toBeNull();
  });
});

describe("parseCheckRequest", () => {
  it("takes items with and without a file, and a default title", () => {
    expect(parseCheckRequest({ items: [{ label: "Looks right" }, { label: "Maths", path: "m.md", view: "preview" }] })).toEqual({
      title: "Check",
      items: [{ label: "Looks right" }, { label: "Maths", target: { path: "m.md", view: "preview" } }],
    });
  });

  it.each([
    [null, "requestCheck takes { title, items }."],
    [{ items: [] }, "requestCheck needs at least one item."],
    [{ items: "x" }, "requestCheck needs at least one item."],
    [{ items: [{ label: "" }] }, "Every requestCheck item needs a non-empty label."],
    [{ items: [{ label: "a", path: "x", view: "nope" }] }, 'Item "a": path must be a non-empty string and view one of editor, preview, canvas, split.'],
    [{ items: Array.from({ length: MAX_CHECK_ITEMS + 1 }, () => ({ label: "x" })) }, `requestCheck takes at most ${MAX_CHECK_ITEMS} items.`],
  ])("says what is wrong with %j", (raw, message) => {
    expect(parseCheckRequest(raw)).toBe(message);
  });
});

describe("isPaneCommand", () => {
  const show = { kind: "show", sessionId: "s", cwd: "/p", path: "a.md", view: "editor" };
  const check = {
    kind: "check",
    sessionId: "s",
    cwd: "/p",
    id: "c1",
    title: "T",
    items: [{ label: "x" }, { label: "y", target: { path: "a.md", view: "canvas", line: 2 } }],
  };
  it("accepts what the server publishes", () => {
    expect(isPaneCommand(show)).toBe(true);
    expect(isPaneCommand(check)).toBe(true);
  });
  it.each([
    [{ ...show, view: "window" }],
    [{ ...show, sessionId: 1 }],
    [{ ...show, cwd: undefined }],
    [{ ...check, items: [{ label: 1 }] }],
    [{ ...check, items: [{ label: "x", target: { path: "a", view: "editor", line: -1 } }] }],
    [{ ...check, kind: "other" }],
    ["show"],
  ])("refuses %j", (value) => {
    expect(isPaneCommand(value)).toBe(false);
  });
});

describe("checkSummary", () => {
  const check = { title: "Maths", items: [{ label: "Inline drawn" }, { label: "Price stays text" }] };
  it("writes one line, OK / NG per item with the note, and the count of NG", () => {
    expect(
      checkSummary(check, [
        { ok: true, note: "" },
        { ok: false, note: " shown as\na formula " },
      ]),
    ).toBe('Check results for "Maths" (1 NG): 1. OK: Inline drawn 2. NG: Price stays text — shown as a formula');
    expect(
      checkSummary(check, [
        { ok: true, note: "" },
        { ok: true, note: "" },
      ]),
    ).toBe('Check results for "Maths" (all OK): 1. OK: Inline drawn 2. OK: Price stays text');
  });
  it("never contains a newline, whatever the title, labels or notes hold", () => {
    const multiline = { title: "A\nB", items: [{ label: "x\ny" }, { label: "z\r\n" }] };
    expect(
      checkSummary(multiline, [
        { ok: false, note: "a\nb\r\nc" },
        { ok: true, note: "\n" },
      ]),
    ).not.toMatch(/[\r\n]/);
  });
  // The summary is typed into the PTY: an ESC or CSI byte would be a keystroke, not text.
  it("drops control bytes from the label, the note and the title", () => {
    const hostile = { title: "T\u001b[2J", items: [{ label: "a\u009b31mb" }] };
    const summary = checkSummary(hostile, [{ ok: false, note: "x\u0007\u001b]0;y\u0007" }]);
    expect(summary).not.toMatch(/\p{Cc}/u);
    expect(summary).toBe('Check results for "T [2J" (1 NG): 1. NG: a 31mb — x ]0;y');
  });
});

describe("checkClosedNotice", () => {
  it("names the check on one line, without control bytes", () => {
    expect(checkClosedNotice({ title: "Maths" })).toBe('Check "Maths" was closed without answers.');
    expect(checkClosedNotice({ title: "a\nb\u001b[2J" })).toBe('Check "a b [2J" was closed without answers.');
  });
});
