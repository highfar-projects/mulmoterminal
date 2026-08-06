// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createOutputRelay, wireBufferedOutput } from "../../../server/session/output-relay.js";
import type { PtyEntry } from "../../../server/session/types.js";

const OPEN = 1;
const LIMIT = 1000;
const FLUSH_INTERVAL_MS = 8;

function fakeSocket() {
  const sent: string[] = [];
  return { sent, socket: { readyState: OPEN, OPEN, send: (d: string) => sent.push(d), close: () => undefined } };
}

// Only the fields the relay touches; the rest of a PtyEntry has no bearing here.
function fakeEntry(socket: ReturnType<typeof fakeSocket>["socket"] | null) {
  return { ws: socket, buffer: "" } as unknown as PtyEntry;
}

const outputs = (sent: readonly string[]) => sent.map((raw) => JSON.parse(raw)).map((frame: { data: string }) => frame.data);

describe("createOutputRelay", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Past the interval, so the first push of every test is treated as idle output.
    vi.setSystemTime(1_000_000);
  });
  afterEach(() => vi.useRealTimers());

  it("sends the first chunk at once — a keystroke echo must not wait for a batch", () => {
    const s = fakeSocket();
    const relay = createOutputRelay(fakeEntry(s.socket), LIMIT);
    relay.push("$ ");
    expect(outputs(s.sent)).toEqual(["$ "]);
  });

  it("batches the chunks that follow it into one frame", () => {
    const s = fakeSocket();
    const relay = createOutputRelay(fakeEntry(s.socket), LIMIT);
    relay.push("a");
    relay.push("b");
    relay.push("c");
    expect(outputs(s.sent)).toEqual(["a"]); // b and c are still queued
    vi.advanceTimersByTime(FLUSH_INTERVAL_MS);
    expect(outputs(s.sent)).toEqual(["a", "bc"]);
  });

  it("goes back to sending at once once the flood stops", () => {
    const s = fakeSocket();
    const relay = createOutputRelay(fakeEntry(s.socket), LIMIT);
    relay.push("a");
    relay.push("b");
    vi.advanceTimersByTime(FLUSH_INTERVAL_MS);
    vi.advanceTimersByTime(FLUSH_INTERVAL_MS); // idle for longer than one interval
    relay.push("c");
    expect(outputs(s.sent)).toEqual(["a", "b", "c"]);
  });

  it("keeps every chunk in the replay buffer as it arrives, batched or not", () => {
    const entry = fakeEntry(fakeSocket().socket);
    const relay = createOutputRelay(entry, LIMIT);
    relay.push("a");
    relay.push("b");
    relay.push("c");
    expect(entry.buffer).toBe("abc"); // before any flush
  });

  it("flush() sends what is queued, so it can precede an exit frame", () => {
    const s = fakeSocket();
    const relay = createOutputRelay(fakeEntry(s.socket), LIMIT);
    relay.push("a");
    relay.push("tail");
    relay.flush();
    expect(outputs(s.sent)).toEqual(["a", "tail"]);
    vi.advanceTimersByTime(FLUSH_INTERVAL_MS); // the cancelled timer must not fire a second copy
    expect(outputs(s.sent)).toEqual(["a", "tail"]);
  });

  it("flush() on an empty queue sends nothing", () => {
    const s = fakeSocket();
    createOutputRelay(fakeEntry(s.socket), LIMIT).flush();
    expect(s.sent).toEqual([]);
  });

  it("discard() drops the queue — a reattach replays it from the buffer instead", () => {
    const s = fakeSocket();
    const relay = createOutputRelay(fakeEntry(s.socket), LIMIT);
    relay.push("a");
    relay.push("queued");
    relay.discard();
    vi.advanceTimersByTime(FLUSH_INTERVAL_MS);
    expect(outputs(s.sent)).toEqual(["a"]);
  });

  it("sends a batch to the socket the entry holds AT FLUSH, not the one it held at push", () => {
    const first = fakeSocket();
    const second = fakeSocket();
    const entry = fakeEntry(first.socket);
    const relay = createOutputRelay(entry, LIMIT);
    relay.push("a");
    relay.push("during-reattach");
    entry.ws = second.socket as unknown as PtyEntry["ws"];
    vi.advanceTimersByTime(FLUSH_INTERVAL_MS);
    expect(outputs(first.sent)).toEqual(["a"]);
    expect(outputs(second.sent)).toEqual(["during-reattach"]);
  });

  it("survives a session with no socket attached", () => {
    const entry = fakeEntry(null);
    const relay = createOutputRelay(entry, LIMIT);
    relay.push("background output");
    vi.advanceTimersByTime(FLUSH_INTERVAL_MS);
    expect(entry.buffer).toBe("background output");
  });

  it("bounds the buffer it grows, leaving the reader the exact cut", () => {
    const entry = fakeEntry(fakeSocket().socket);
    const relay = createOutputRelay(entry, 10);
    for (let i = 0; i < 100; i++) relay.push("0123456789");
    expect(entry.buffer.length).toBeLessThanOrEqual(12); // 10 * TAIL_SLACK
  });
});

describe("wireBufferedOutput", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
  });
  afterEach(() => vi.useRealTimers());

  // node-pty's onData, reduced to the one thing this wiring needs from it.
  function fakePty() {
    let emit: ((data: string) => void) | undefined;
    const term = { onData: (fn: (data: string) => void) => (emit = fn) };
    return { term, feed: (data: string) => emit?.(data) };
  }

  const entryFor = (pty: ReturnType<typeof fakePty>, socket: ReturnType<typeof fakeSocket>["socket"]) =>
    ({ ws: socket, buffer: "", term: pty.term }) as unknown as PtyEntry;

  it("puts the relay where a reattach can find it, and forwards pty output through it", () => {
    const pty = fakePty();
    const s = fakeSocket();
    const entry = entryFor(pty, s.socket);
    const relay = wireBufferedOutput(entry, LIMIT);
    expect(entry.output).toBe(relay);
    pty.feed("hello");
    expect(outputs(s.sent)).toEqual(["hello"]);
    expect(entry.buffer).toBe("hello");
  });

  it("feeds the spawner's tap every chunk, unbatched — it scans the stream, it does not draw it", () => {
    const pty = fakePty();
    const seen: string[] = [];
    wireBufferedOutput(entryFor(pty, fakeSocket().socket), LIMIT, (data) => seen.push(data));
    pty.feed("a");
    pty.feed("b");
    pty.feed("c");
    expect(seen).toEqual(["a", "b", "c"]); // b and c are still queued for the browser
  });
});
