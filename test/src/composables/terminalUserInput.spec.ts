import { describe, it, expect } from "vitest";
import { isTypedInput } from "../../../src/composables/terminalUserInput";
import { clickReportSequences, wheelReportSequence } from "../../../src/composables/mouseReports";

describe("isTypedInput", () => {
  it("counts ordinary characters, control bytes and pastes", () => {
    for (const data of ["a", "hello", "\r", "\x1b\r", "\x03", "多バイト", "a long pasted line\nwith a newline"]) {
      expect(isTypedInput(data)).toBe(true);
    }
  });

  // The reason this predicate exists: a parked cell must survive being CLICKED to read it, and a
  // click on a mouse-tracking app is delivered as input. Built from the same generator the app
  // sends, so a change to the report format cannot leave this matching a shape nobody emits.
  it("rejects the click reports the app synthesizes", () => {
    for (const seq of clickReportSequences(12, 34)) {
      expect(isTypedInput(seq)).toBe(false);
    }
  });

  it("rejects wheel reports, so scrolling a parked cell does not wake it", () => {
    const up = wheelReportSequence(-1, 5, 5);
    const down = wheelReportSequence(1, 5, 5);
    expect(up).not.toBeNull();
    expect(down).not.toBeNull();
    expect(isTypedInput(up ?? "")).toBe(false);
    expect(isTypedInput(down ?? "")).toBe(false);
  });

  // Not synthesized by this app, but a terminal can still emit it for an app that asked for a
  // non-SGR encoding.
  it("rejects a legacy X10 mouse report", () => {
    expect(isTypedInput("\x1b[M !!")).toBe(false);
  });

  // Clicking a cell moves focus, so focus tracking would be the back door into the same bug.
  it("rejects focus-gained and focus-lost reports", () => {
    expect(isTypedInput("\x1b[I")).toBe(false);
    expect(isTypedInput("\x1b[O")).toBe(false);
  });

  // tmux queries every client that attaches, so a cell reconnecting after its PTY was reaped is
  // answered by xterm.js with nobody at the keyboard. These are the replies captured on that path.
  it("rejects the replies xterm.js sends to tmux's attach-time queries", () => {
    const replies = ["\x1b[?1;2c", "\x1b[>0;276;0c", "\x1b]10;rgb:e0e0/e0e0/e0e0\x1b\\", "\x1b]11;rgb:1a1a/1a1a/2e2e\x1b\\", "\x1b]11;rgb:1a1a/1a1a/2e2e\x07"];
    for (const data of [...replies, replies.join("")]) {
      expect(isTypedInput(data)).toBe(false);
    }
  });

  it("rejects the other replies xterm.js writes on the same channel", () => {
    for (const data of ["\x1b[12;40R", "\x1b[?12;40R", "\x1b[0n", "\x1b[?2026;2$y", "\x1b[8;24;80t", "\x1b]4;1;rgb:cdcd/3131/3131\x1b\\", "\x1bP1$r0m\x1b\\"]) {
      expect(isTypedInput(data)).toBe(false);
    }
  });

  // The reply scanner holds an unfinished tail for a socket that may split it; xterm.js never splits
  // a reply, so in the browser that tail is a whole keystroke — Alt+[ is exactly ESC[.
  it("counts a key that looks like the start of a reply", () => {
    for (const data of ["\x1b[", "\x1b]", "\x1b[?", "\x1b"]) {
      expect(isTypedInput(data)).toBe(true);
    }
  });

  it("counts a reply with something typed beside it", () => {
    expect(isTypedInput("\x1b[?1;2ca")).toBe(true);
  });

  // A CSI sequence that is neither is still the user: arrow keys, Home/End and function keys all
  // arrive this way, and treating "starts with ESC[" as not-typing would swallow them.
  it("counts arrow keys and other CSI keystrokes", () => {
    for (const data of ["\x1b[A", "\x1b[B", "\x1b[3~", "\x1b[1;5C"]) {
      expect(isTypedInput(data)).toBe(true);
    }
  });
});
