// The host half of gui-chat-protocol 2.0.0's reader contract. `dispatch` and
// `subscribe` each grew a validated overload, and neither is reachable through the
// type system alone — TypeScript relates an overloaded target leniently, so the old
// `dispatch<T>(args)` that ignored a second argument still compiled against the new
// signature. What it did NOT do was call `parse`. These pin the behavior instead.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const m = vi.hoisted(() => ({ subscribe: vi.fn() }));
vi.mock("../../../src/composables/usePubSub", () => ({ usePubSub: () => ({ subscribe: m.subscribe }) }));

import { makeBrowserPluginRuntime } from "../../../src/composables/pluginRuntime";
import { PLUGIN_DISPATCH_TIMEOUT_MS } from "../../../src/composables/pluginDispatchDeadline";
import { SLOW_COMMAND_TIMEOUT_MS } from "../../../src/utils/fetchWithTimeout";

// Stand in for the socket: remember the channel the runtime subscribed to and hand
// back a way to push a raw frame down it, as usePubSub's callback would.
function captureChannel(): { channel: () => string; emit: (raw: unknown) => void; unsubscribed: () => boolean } {
  let channel = "";
  let handler: (raw: unknown) => void = () => {};
  let unsubscribed = false;
  m.subscribe.mockImplementation((ch: string, cb: (raw: unknown) => void) => {
    channel = ch;
    handler = cb;
    return () => {
      unsubscribed = true;
    };
  });
  return { channel: () => channel, emit: (raw) => handler(raw), unsubscribed: () => unsubscribed };
}

const runtime = () => makeBrowserPluginRuntime({ scope: "markdown", toolName: "presentDocument" });

describe("makeBrowserPluginRuntime dispatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // In afterEach rather than at the end of each test: a failing assertion throws, and an
  // unstub that never runs leaves a mocked `fetch` behind for whatever runs next.
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs to the tool's dispatch route and returns the raw JSON when no reader is passed", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ count: 2 }) });
    vi.stubGlobal("fetch", fetchMock);

    await expect(runtime().dispatch({ kind: "list" })).resolves.toEqual({ count: 2 });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/plugin/presentDocument");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "POST", body: JSON.stringify({ kind: "list" }) });
  });

  // The whole point of the 2.0.0 signature: the reader runs against what the route
  // actually answered. A host that accepted `parse` and ignored it would type-check.
  it("runs the reader over the response body when one is passed", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ count: 2 }) }));

    const parse = vi.fn((raw: unknown) => `parsed:${JSON.stringify(raw)}`);
    await expect(runtime().dispatch({ kind: "list" }, parse)).resolves.toBe('parsed:{"count":2}');
    expect(parse).toHaveBeenCalledOnce();
  });

  it("throws with the route's status and body on a non-2xx response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500, statusText: "Server Error", text: () => Promise.resolve("boom") }));

    await expect(runtime().dispatch({ kind: "list" })).rejects.toThrow("plugin/presentDocument dispatch failed (500): boom");
  });
});

// A movie render answers only when it is done. The browser used to give up at a minute and show
// the abort as a failure while the server went on to finish (#2908).
describe("makeBrowserPluginRuntime dispatch deadline", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  // Settles only when its signal aborts, the way a request the server is still working on does.
  const fetchThatWaits = () =>
    vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("signal is aborted without reason", "AbortError")));
        }),
    );

  it("is still waiting after the minute that used to cut it off", async () => {
    vi.stubGlobal("fetch", fetchThatWaits());
    const settled = vi.fn();
    void runtime().dispatch({ kind: "generateMovie" }).then(settled, settled);

    await vi.advanceTimersByTimeAsync(SLOW_COMMAND_TIMEOUT_MS + 1_000);
    expect(settled).not.toHaveBeenCalled();
  });

  it("gives up at the plugin deadline with a timeout, not a bare abort", async () => {
    vi.stubGlobal("fetch", fetchThatWaits());
    const outcome = runtime()
      .dispatch({ kind: "generateMovie" })
      .catch((err: unknown) => err);

    await vi.advanceTimersByTimeAsync(PLUGIN_DISPATCH_TIMEOUT_MS);
    const err = await outcome;
    expect(String(err)).toContain("plugin/presentDocument gave no answer within 60 minutes");
    expect(String(err)).not.toContain("aborted without reason");
  });
});

describe("makeBrowserPluginRuntime subscribe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("routes the event name onto the scoped plugin channel", () => {
    const wire = captureChannel();
    runtime().pubsub.subscribe("file:changed", () => {});
    expect(wire.channel()).toBe("plugin:markdown:file:changed");
  });

  it("returns the unsubscribe the socket handed back", () => {
    const wire = captureChannel();
    const off = runtime().pubsub.subscribe("changed", () => {});
    expect(wire.unsubscribed()).toBe(false);
    off();
    expect(wire.unsubscribed()).toBe(true);
  });

  it("delivers the raw payload when no reader is passed", () => {
    const wire = captureChannel();
    const seen: unknown[] = [];
    runtime().pubsub.subscribe("changed", (payload) => seen.push(payload));
    wire.emit({ path: "a.md" });
    expect(seen).toEqual([{ path: "a.md" }]);
  });

  it("delivers the reader's return value when one is passed", () => {
    const wire = captureChannel();
    const seen: string[] = [];
    runtime().pubsub.subscribe("changed", { parse: (raw) => (typeof raw === "string" ? raw.toUpperCase() : null) }, (payload) => seen.push(payload));
    wire.emit("a.md");
    expect(seen).toEqual(["A.MD"]);
  });

  // A stream drops what it cannot read; it does not call the handler with a null the
  // plugin never asked for.
  it("drops a frame the reader rejects with null", () => {
    const wire = captureChannel();
    const seen: string[] = [];
    runtime().pubsub.subscribe("changed", { parse: (raw) => (typeof raw === "string" ? raw : null) }, (payload) => seen.push(payload));
    wire.emit(42);
    wire.emit("ok.md");
    expect(seen).toEqual(["ok.md"]);
  });

  // The documented reader idiom is `Schema.parse(raw)`, and Zod's parse THROWS. If that
  // escaped, one malformed frame would tear down the socket callback and take every
  // other subscriber on the channel with it. Removing the try/catch turns this red.
  it("keeps delivering after a reader throws on one frame", () => {
    const wire = captureChannel();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const seen: string[] = [];
    runtime().pubsub.subscribe(
      "changed",
      {
        parse: (raw) => {
          if (typeof raw !== "string") throw new Error("not a string");
          return raw;
        },
      },
      (payload) => seen.push(payload),
    );

    expect(() => wire.emit(42)).not.toThrow();
    wire.emit("ok.md");

    expect(seen).toEqual(["ok.md"]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
