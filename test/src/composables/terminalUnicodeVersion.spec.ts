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
import { getTerminalUnicodeVersion, setTerminalUnicodeVersion } from "../../../src/composables/terminalUnicodeVersion";
import { FakeWebSocket } from "../../helpers/xtermDouble";

const KEY = "cell-unicode";
const target = { sessionId: null, cwd: "/w", devTerminal: false, command: null, launcher: null };

describe("the width table a terminal counts cells with", () => {
  beforeEach(() => {
    FakeWebSocket.instances.length = 0;
    globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
    setTerminalUnicodeVersion(undefined);
    mockTermState.unicode.activeVersion = "6";
  });
  afterEach(() => {
    conn.release(KEY);
    setTerminalUnicodeVersion(undefined);
  });

  it("stays on xterm's default table when the server says nothing", () => {
    conn.attach(KEY, target, {}, document.createElement("div"));
    expect(mockTermState.unicode.activeVersion).toBe("6");
  });

  it("builds a terminal on the table the server asked for", () => {
    setTerminalUnicodeVersion("11");
    conn.attach(KEY, target, {}, document.createElement("div"));
    expect(mockTermState.unicode.activeVersion).toBe("11");
  });

  it("carries a late answer to a terminal built before it", async () => {
    conn.attach(KEY, target, {}, document.createElement("div"));
    setTerminalUnicodeVersion("11");
    await nextTick();
    expect(mockTermState.unicode.activeVersion).toBe("11");
  });

  it.each([null, "", "12", 11, { version: "11" }])("falls back to the default for %j", (value) => {
    setTerminalUnicodeVersion("11");
    setTerminalUnicodeVersion(value);
    expect(getTerminalUnicodeVersion()).toBe("6");
  });
});
