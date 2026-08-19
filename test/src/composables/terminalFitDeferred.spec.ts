import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Same doubles as the sibling connection specs (test/helpers/xtermDouble.ts); see the note there
// about why the mock factories import themselves.
const { termState: mockTermState, keyState: mockKeyState } = await vi.hoisted(async () => (await import("../../helpers/xtermDouble")).createXtermState());

vi.mock("@xterm/xterm", async () => (await import("../../helpers/xtermDouble")).xtermModule(mockTermState, mockKeyState));
vi.mock("@xterm/addon-fit", async () => (await import("../../helpers/xtermDouble")).fitAddonModule());
vi.mock("@xterm/addon-web-links", async () => (await import("../../helpers/xtermDouble")).webLinksAddonModule());
vi.mock("@xterm/addon-clipboard", async () => (await import("../../helpers/xtermDouble")).clipboardAddonModule());
vi.mock("@xterm/xterm/css/xterm.css", () => ({}));

import * as conn from "../../../src/composables/useTerminalConnections";
import { FakeWebSocket } from "../../helpers/xtermDouble";

// A fit that lands while the cell is off screen is what strands a scrollbar in an agent cell
// (#1762): xterm has the renderer paused there, so the resize reaches the buffer while the
// renderer's dimensions stay behind, and in the alternate buffer nothing recomputes the viewport
// afterwards. The manager therefore holds the fit until the cell is back — the RULE is covered in
// terminalFitGate.spec; what this file pins is that the manager is actually wired to it, since
// jsdom has no IntersectionObserver of its own and a missing observer would look identical to a
// working one on every other spec.

const KEY = "cell-fit-gate";
const target = { sessionId: null, cwd: "/w", devTerminal: false, command: null, launcher: null };
const resizeFrames = (ws: FakeWebSocket) => ws.sent.map((s) => JSON.parse(s)).filter((m) => m.type === "resize");

// What a browser would deliver, in the manager's own hands. Module state rather than instance
// state because the manager builds the observer itself: a test never holds the instance.
let deliverToManager: ((isIntersecting: boolean) => void) | null = null;
let observedElements: Element[] = [];
let stoppedWatching = false;

class IntersectionObserverStub {
  constructor(callback: (entries: { isIntersecting: boolean }[]) => void) {
    deliverToManager = (isIntersecting) => callback([{ isIntersecting }]);
    observedElements = [];
    stoppedWatching = false;
  }
  observe(el: Element) {
    observedElements.push(el);
  }
  disconnect() {
    stoppedWatching = true;
  }
  unobserve() {}
  takeRecords() {
    return [];
  }
}

const deliver = (isIntersecting: boolean): void => {
  if (!deliverToManager) throw new Error("the manager never observed the terminal");
  deliverToManager(isIntersecting);
};

const socket = (): FakeWebSocket => {
  const ws = FakeWebSocket.instances.at(-1);
  if (!ws) throw new Error("no socket created");
  return ws;
};

describe("fit while the terminal is off screen", () => {
  beforeEach(() => {
    FakeWebSocket.instances.length = 0;
    deliverToManager = null;
    globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
    globalThis.IntersectionObserver = IntersectionObserverStub as unknown as typeof IntersectionObserver;
  });
  afterEach(() => {
    conn.release(KEY);
    Reflect.deleteProperty(globalThis, "IntersectionObserver");
  });

  it("watches the host it owns", () => {
    const el = document.createElement("div");
    conn.attach(KEY, target, {}, el);
    expect(observedElements).toEqual([el.firstElementChild]);
  });

  it("fits before the observer has reported anything", () => {
    const el = document.createElement("div");
    conn.attach(KEY, target, {}, el);
    socket().sent.length = 0;

    conn.fit(KEY);

    // Only a delivery can close the gate. One that started closed would hold back the fit attach()
    // does before connect(), and the pty would be spawned at xterm's 80x24 (#1178).
    expect(resizeFrames(socket())).toHaveLength(1);
  });

  it("does not resize the pty while the cell is off screen", () => {
    const el = document.createElement("div");
    conn.attach(KEY, target, {}, el);
    deliver(false);
    socket().sent.length = 0;

    conn.fit(KEY);
    conn.fit(KEY);

    expect(resizeFrames(socket())).toHaveLength(0);
  });

  it("runs the held-back fit once the cell is back on screen", () => {
    const el = document.createElement("div");
    conn.attach(KEY, target, {}, el);
    deliver(false);
    conn.fit(KEY);
    conn.fit(KEY);
    socket().sent.length = 0;

    deliver(true);

    expect(resizeFrames(socket())).toHaveLength(1);
  });

  it("does not fit on a return that nothing was waiting for", () => {
    const el = document.createElement("div");
    conn.attach(KEY, target, {}, el);
    deliver(false);
    deliver(true);
    socket().sent.length = 0;

    deliver(true);

    expect(resizeFrames(socket())).toHaveLength(0);
  });

  it("fits normally again once the cell is back", () => {
    const el = document.createElement("div");
    conn.attach(KEY, target, {}, el);
    deliver(false);
    deliver(true);
    socket().sent.length = 0;

    conn.fit(KEY);

    expect(resizeFrames(socket())).toHaveLength(1);
  });

  it("stops watching when the slot is torn down", () => {
    const el = document.createElement("div");
    conn.attach(KEY, target, {}, el);
    conn.release(KEY);
    expect(stoppedWatching).toBe(true);
  });
});
