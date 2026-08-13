// The clipboard route the browser leaves us, and the conditions on the fallback. Worth pinning
// because the fallback copies the SELECTION rather than the string it is handed: it fires xterm's
// own `copy` listener, so it only does the right thing while xterm's helper textarea holds focus,
// and "returned true" is the only signal the caller gets that anything was copied.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { writeTerminalSelection } from "../../../src/utils/terminalSelectionClipboard";

const hostWithTextarea = (): HTMLDivElement => {
  const host = document.createElement("div");
  const textarea = document.createElement("textarea");
  textarea.className = "xterm-helper-textarea";
  host.appendChild(textarea);
  document.body.appendChild(host);
  return host;
};

const focusHelper = (host: HTMLDivElement): void => {
  const textarea = host.querySelector<HTMLTextAreaElement>(".xterm-helper-textarea");
  textarea?.focus();
};

const setClipboard = (value: { writeText: (text: string) => Promise<void> } | undefined): void => {
  Object.defineProperty(navigator, "clipboard", { value, configurable: true, writable: true });
};

describe("writeTerminalSelection", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    setClipboard(undefined);
    vi.restoreAllMocks();
  });

  it("uses navigator.clipboard when it is there, and does not touch the fallback", async () => {
    const writeText = vi.fn(async () => {});
    setClipboard({ writeText });
    const execCommand = vi.fn(() => true);
    document.execCommand = execCommand;

    expect(await writeTerminalSelection(hostWithTextarea(), "copied")).toBe(true);
    expect(writeText).toHaveBeenCalledWith("copied");
    expect(execCommand).not.toHaveBeenCalled();
  });

  // At `http://<lan-ip>` — an ordinary way to reach this app from a second machine — the API does
  // not exist at all, which is the whole reason the fallback is there.
  it("falls back to execCommand when there is no clipboard API and the helper textarea has focus", async () => {
    setClipboard(undefined);
    const execCommand = vi.fn(() => true);
    document.execCommand = execCommand;
    const host = hostWithTextarea();
    focusHelper(host);

    expect(await writeTerminalSelection(host, "copied")).toBe(true);
    expect(execCommand).toHaveBeenCalledWith("copy");
  });

  it("falls back when the clipboard API rejects (no focus / permission refused)", async () => {
    setClipboard({
      writeText: vi.fn(async () => {
        throw new Error("not focused");
      }),
    });
    const execCommand = vi.fn(() => true);
    document.execCommand = execCommand;
    const host = hostWithTextarea();
    focusHelper(host);

    expect(await writeTerminalSelection(host, "copied")).toBe(true);
    expect(execCommand).toHaveBeenCalledWith("copy");
  });

  // Focus is the fallback's precondition, not something it takes: execCommand("copy") would copy
  // whatever the FOCUSED element has selected, so firing it elsewhere copies the wrong thing.
  it("refuses rather than copying when something else holds focus", async () => {
    setClipboard(undefined);
    const execCommand = vi.fn(() => true);
    document.execCommand = execCommand;
    const host = hostWithTextarea();
    const elsewhere = document.createElement("input");
    document.body.appendChild(elsewhere);
    elsewhere.focus();

    expect(await writeTerminalSelection(host, "copied")).toBe(false);
    expect(execCommand).not.toHaveBeenCalled();
  });

  it("refuses when the host has no helper textarea at all", async () => {
    setClipboard(undefined);
    document.execCommand = vi.fn(() => true);

    expect(await writeTerminalSelection(document.createElement("div"), "copied")).toBe(false);
  });

  it("reports failure instead of throwing when execCommand throws", async () => {
    setClipboard(undefined);
    document.execCommand = vi.fn(() => {
      throw new Error("blocked");
    });
    const host = hostWithTextarea();
    focusHelper(host);

    expect(await writeTerminalSelection(host, "copied")).toBe(false);
  });
});
