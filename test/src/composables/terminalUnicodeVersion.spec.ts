import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { nextTick } from "vue";

// Same doubles as the sibling connection specs (test/helpers/xtermDouble.ts).
const { termState: mockTermState, keyState: mockKeyState } = await vi.hoisted(async () => (await import("../../helpers/xtermDouble")).createXtermState());

vi.mock("@xterm/xterm", async () => (await import("../../helpers/xtermDouble")).xtermModule(mockTermState, mockKeyState));
vi.mock("@xterm/addon-fit", async () => (await import("../../helpers/xtermDouble")).fitAddonModule());
vi.mock("@xterm/addon-web-links", async () => (await import("../../helpers/xtermDouble")).webLinksAddonModule());
vi.mock("@xterm/addon-clipboard", async () => (await import("../../helpers/xtermDouble")).clipboardAddonModule());
vi.mock("@xterm/xterm/css/xterm.css", () => ({}));

import * as conn from "../../../src/composables/useTerminalConnections";
import {
  getTerminalUnicodeVersion,
  getTerminalWidthTable,
  setTerminalUnicodeVersion,
  setTerminalWidthTable,
} from "../../../src/composables/terminalUnicodeVersion";
import { FakeWebSocket } from "../../helpers/xtermDouble";

const KEY = "cell-unicode";
const target = { sessionId: null, cwd: "/w", devTerminal: false, command: null, launcher: null };

const TABLE = { runs: [[0x2705, 0x2705, 2]], folding: "tmux-3.6a", vs16Wide: true };

describe("the width table a terminal counts cells with", () => {
  beforeEach(() => {
    FakeWebSocket.instances.length = 0;
    globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
    setTerminalUnicodeVersion(undefined);
    setTerminalWidthTable(undefined);
    mockTermState.unicode.activeVersion = "6";
    mockTermState.unicode.registered.length = 0;
  });
  afterEach(() => {
    conn.release(KEY);
    setTerminalUnicodeVersion(undefined);
    setTerminalWidthTable(undefined);
  });

  it("counts with Unicode 11 when the server says nothing", () => {
    conn.attach(KEY, target, {}, document.createElement("div"));
    expect(mockTermState.unicode.activeVersion).toBe("11");
    expect(mockTermState.unicode.registered).toEqual([]);
  });

  it("builds a terminal on the built-in table the server named", () => {
    setTerminalUnicodeVersion("6");
    conn.attach(KEY, target, {}, document.createElement("div"));
    expect(mockTermState.unicode.activeVersion).toBe("6");
  });

  it("counts with the table measured from tmux when the server sent one", () => {
    setTerminalWidthTable(TABLE);
    conn.attach(KEY, target, {}, document.createElement("div"));
    expect(mockTermState.unicode.registered).toEqual(["tmux"]);
    expect(mockTermState.unicode.activeVersion).toBe("tmux");
  });

  it("carries a measured table that arrives late to a terminal built before it", async () => {
    conn.attach(KEY, target, {}, document.createElement("div"));
    setTerminalWidthTable(TABLE);
    await nextTick();
    expect(mockTermState.unicode.registered).toEqual(["tmux"]);
    expect(mockTermState.unicode.activeVersion).toBe("tmux");
  });

  it("asks tmux to repaint an open terminal when the table changes, since xterm keeps parsed cells", async () => {
    conn.attach(KEY, target, {}, document.createElement("div"));
    const socket = FakeWebSocket.instances.at(-1);
    if (!socket) throw new Error("no socket");
    socket.sent.length = 0;
    setTerminalWidthTable(TABLE);
    await nextTick();
    expect(socket.sent.map((data) => JSON.parse(data))).toContainEqual({ type: "redraw" });
  });

  it("goes back to the named table when the measured one is withdrawn", async () => {
    setTerminalWidthTable(TABLE);
    conn.attach(KEY, target, {}, document.createElement("div"));
    // Each change is its own config load; within one tick the watch would see no change at all.
    await nextTick();
    setTerminalWidthTable(null);
    await nextTick();
    expect(mockTermState.unicode.activeVersion).toBe("11");
  });

  it.each([null, "", "12", 11, { version: "11" }])("falls back to Unicode 11 for a named table of %j", (value) => {
    setTerminalUnicodeVersion("6");
    setTerminalUnicodeVersion(value);
    expect(getTerminalUnicodeVersion()).toBe("11");
  });

  it.each([null, "tmux", [], { runs: [[1, 2, 1]], folding: "tmux-3.6a", vs16Wide: true }, { runs: [] }])("ignores a measured table of %j", (value) => {
    setTerminalWidthTable(TABLE);
    setTerminalWidthTable(value);
    expect(getTerminalWidthTable()).toBeNull();
  });
});
