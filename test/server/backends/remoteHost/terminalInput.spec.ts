// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import type { SessionAgent } from "../../../../common/sessionAgent.js";

import {
  sanitizeTerminalInput,
  canClearInputBox,
  createTerminalInputSender,
  DUPLICATE_INPUT_WINDOW_MS,
} from "../../../../server/backends/remoteHost/terminalInput.js";

// Any byte in these ranges, if it survived, could break out of the bracketed paste and run as
// control input on the host's terminal — the exact thing the sanitizer exists to prevent.
// eslint-disable-next-line no-control-regex -- intentional: assert the sanitizer strips C0/C1 control bytes
const CONTROL_BYTE = /[\u0000-\u001F\u007F-\u009F]/;

describe("sanitizeTerminalInput", () => {
  it("leaves ordinary text alone", () => {
    expect(sanitizeTerminalInput("hello world")).toBe("hello world");
  });

  it("trims and collapses whitespace runs", () => {
    expect(sanitizeTerminalInput("  a    b  ")).toBe("a b");
  });

  // The security cases: each control byte becomes a space, so nothing it introduced can act as
  // a terminal command. \x1b = ESC, \x03 = Ctrl-C, \x7f = DEL, \x85 = a C1 byte.
  it.each([
    ["a\x1bb", "a b"],
    ["a\x03b", "a b"],
    ["a\x7fb", "a b"],
    ["a\x85b", "a b"],
    ["line1\nline2", "line1 line2"],
    ["a\r\nb", "a b"],
    ["a\tb", "a b"],
  ])("replaces the control byte in %j with a space", (raw, expected) => {
    expect(sanitizeTerminalInput(raw)).toBe(expected);
  });

  // A bracketed-paste terminator is ESC + "[201~"; stripping the ESC is what defuses it — the
  // leftover "[201~" is inert printable text, and crucially no ESC remains to start a sequence.
  it("defuses an embedded bracketed-paste terminator", () => {
    const out = sanitizeTerminalInput("safe\x1b[201~evil");
    expect(out).toBe("safe [201~evil");
    expect(CONTROL_BYTE.test(out)).toBe(false);
  });

  it("collapses a run of adjacent control bytes to a single space", () => {
    expect(sanitizeTerminalInput("a\x1b\x03\r\nb")).toBe("a b");
  });

  it.each(["", "   ", "\x1b\x03\r\n", "\t\t"])("is empty for input with no printable content (%j)", (raw) => {
    expect(sanitizeTerminalInput(raw)).toBe("");
  });

  // #1142 was "a slash command from the phone never submits", and the trailing space that fixes
  // it is added by submittableLine at paste time — NOT by trimming less here. The trim is what
  // turns control-only input into "" so the caller can refuse it (a control byte becomes a space,
  // so without the trim `"\x03"` would be a truthy `" "` that submits an empty turn). These pin
  // that the sanitizer still trims, so a later reading of #1142 doesn't loosen it instead.
  it.each([
    ["/sync-repos ", "/sync-repos"],
    ["/design 1536 ", "/design 1536"],
    [" /help", "/help"],
  ])("still trims what the phone sent (%j)", (raw, expected) => {
    expect(sanitizeTerminalInput(raw)).toBe(expected);
  });

  it("keeps printable non-ASCII (accents, emoji are not control bytes)", () => {
    expect(sanitizeTerminalInput("café 😀")).toBe("café 😀");
  });

  // The invariant that matters: whatever comes in, no control byte comes out.
  it.each(["plain", "a\x1b[201~b", "\x00\x01\x02mixed\x1b\x7f", "emoji 😀 and\ttabs", "edge"])("never lets a control byte through (%j)", (raw) => {
    expect(CONTROL_BYTE.test(sanitizeTerminalInput(raw))).toBe(false);
  });
});

describe("canClearInputBox", () => {
  // The one and only case that clears the box: a Claude the host has watched finish a turn.
  it("allows clearing a Claude whose turn is known to be over", () => {
    expect(canClearInputBox("claude", false)).toBe(true);
  });

  // Mid-turn Ctrl-C would interrupt the running turn.
  it("refuses while a Claude turn is in progress", () => {
    expect(canClearInputBox("claude", true)).toBe(false);
  });

  // The deliberate asymmetry the code pins with `working === false`, not `working !== true`:
  // a missing activity record means "nobody has reported yet", which covers a live first turn —
  // NOT idle. Reading undefined as idle would interrupt that turn.
  it("refuses a Claude whose turn state is unknown", () => {
    expect(canClearInputBox("claude", undefined)).toBe(false);
  });

  // Codex is excluded even when reported idle: nothing calls setWorking for codex, so `working`
  // is never authoritative there. Shell is excluded because Ctrl-C kills whatever is running.
  it.each<[SessionAgent, boolean | undefined]>([
    ["codex", false],
    ["codex", true],
    ["codex", undefined],
    ["shell", false],
    ["shell", true],
    ["shell", undefined],
  ])("refuses a non-Claude agent (%j, working=%j)", (agent, working) => {
    expect(canClearInputBox(agent, working)).toBe(false);
  });

  it.each<[null | undefined, boolean | undefined]>([
    [null, false],
    [undefined, false],
    [null, undefined],
  ])("refuses when the agent is unknown (%j, working=%j)", (agent, working) => {
    expect(canClearInputBox(agent, working)).toBe(false);
  });
});

const PASTE_START = "\x1b[200~";
const PASTE_END = "\x1b[201~";

describe("createTerminalInputSender", () => {
  // `scheduleSubmit` runs the delayed Enter synchronously, so these tests need no real (or fake)
  // timers for the send itself — only the duplicate-window tests below need to move a clock.
  function makeSender(writeToSession = vi.fn(() => true)) {
    const send = createTerminalInputSender({ writeToSession, scheduleSubmit: (submit) => submit() });
    return { send, writeToSession };
  }

  it("writes the pasted text then the submit sequence, and resolves sent:true", async () => {
    const { send, writeToSession } = makeSender();
    await expect(send("s1", "hello")).resolves.toEqual({ sent: true });
    expect(writeToSession.mock.calls).toEqual([
      ["s1", `${PASTE_START}hello${PASTE_END}`],
      ["s1", "\r"],
    ]);
  });

  it("rejects when the session has no live terminal to write to", async () => {
    const { send } = makeSender(vi.fn(() => false));
    await expect(send("s1", "hello")).rejects.toThrow(/no live terminal/);
  });

  // The bug this exists to fix: the phone's only confirmation a send landed is this call's own
  // response, so a slow or dropped response reads as "did that even go through?" and gets resent —
  // typing the same text again into whatever the session is doing by then, unrelated turn included.
  describe("resending the same text", () => {
    it("suppresses an exact resend to the same session within the window", async () => {
      vi.useFakeTimers();
      try {
        const { send, writeToSession } = makeSender();
        await send("s1", "hello");
        writeToSession.mockClear();
        vi.advanceTimersByTime(DUPLICATE_INPUT_WINDOW_MS - 1);
        await expect(send("s1", "hello")).resolves.toEqual({ sent: false, duplicate: true });
        expect(writeToSession).not.toHaveBeenCalled(); // nothing typed a second time
      } finally {
        vi.useRealTimers();
      }
    });

    it("sends again once the window has passed — it is a second message, not a resend", async () => {
      vi.useFakeTimers();
      try {
        const { send, writeToSession } = makeSender();
        await send("s1", "hello");
        writeToSession.mockClear();
        vi.advanceTimersByTime(DUPLICATE_INPUT_WINDOW_MS);
        await expect(send("s1", "hello")).resolves.toEqual({ sent: true });
        expect(writeToSession).toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });

    it("does not suppress different text to the same session", async () => {
      const { send, writeToSession } = makeSender();
      await send("s1", "hello");
      writeToSession.mockClear();
      await expect(send("s1", "goodbye")).resolves.toEqual({ sent: true });
      expect(writeToSession).toHaveBeenCalled();
    });

    it("does not suppress the same text sent to a DIFFERENT session", async () => {
      const { send, writeToSession } = makeSender();
      await send("s1", "hello");
      writeToSession.mockClear();
      await expect(send("s2", "hello")).resolves.toEqual({ sent: true });
      expect(writeToSession).toHaveBeenCalled();
    });

    // A dispatch that never actually happened is not something to protect against resending —
    // the caller already saw it fail, and refusing the retry would strand them.
    it("does not treat a failed dispatch as something to protect from a retry", async () => {
      const writeToSession = vi.fn(() => false); // every write fails: no live PTY
      const { send } = makeSender(writeToSession);
      await expect(send("s1", "hello")).rejects.toThrow();
      await expect(send("s1", "hello")).rejects.toThrow(); // NOT { sent: false, duplicate: true }
      expect(writeToSession).toHaveBeenCalledTimes(2);
    });
  });
});
