// @vitest-environment node
//
// WHEN THE CLEANUP IS REGISTERED, which is the whole of this file.
//
// Opening the watch is asynchronous — the preview has to be computed before there is anything to
// subscribe to — and a pane that changes page or directory meanwhile closes the request while that
// is still running. With the close handler registered afterwards, the event has already fired by
// the time anything is listening: the Firestore subscriptions and the heartbeat are created a
// moment later and nothing ever stops them. Billed listeners for a reader who has gone, until the
// server exits.

import { describe, it, expect, vi } from "vitest";

import { holdOpen } from "../../../server/backends/sharedApp/previewWatch";

/** A request whose `close` we can fire whenever the test wants to. */
const request = () => {
  let release: (() => void) | null = null;
  return {
    onClose: (fn: () => void) => {
      release = fn;
    },
    close: () => release?.(),
  };
};

describe("holdOpen", () => {
  it("holds the watch and the heartbeat until the request closes", async () => {
    const req = request();
    const stop = vi.fn();
    const quiet = vi.fn();
    const beat = vi.fn(() => quiet);

    await holdOpen({ onClose: req.onClose, open: () => Promise.resolve({ ok: true, watching: ["messages"], stop }), beat, end: vi.fn() });

    expect(beat).toHaveBeenCalledTimes(1);
    expect(stop).not.toHaveBeenCalled();

    req.close();
    expect(stop).toHaveBeenCalledTimes(1);
    expect(quiet).toHaveBeenCalledTimes(1);
  });

  it("stops a watch that arrives after the request has already closed", async () => {
    // The leak. The pane went while the preview was still being computed, so the subscriptions were
    // created for nobody — and the handler that would have stopped them was registered after them.
    const req = request();
    const stop = vi.fn();
    const beat = vi.fn(() => vi.fn());
    // The resolver, held in a list rather than in a `let`: assigned inside the executor, a nullable
    // narrows to `null` at the call below and a placeholder function lies about its arity.
    const answer: ((handle: { ok: true; watching: string[]; stop: () => void }) => void)[] = [];
    const opening = new Promise<{ ok: true; watching: string[]; stop: () => void }>((resolve) => answer.push(resolve));

    const held = holdOpen({ onClose: req.onClose, open: () => opening, beat, end: vi.fn() });
    req.close();
    answer[0]?.({ ok: true, watching: ["messages"], stop });
    await held;

    expect(stop).toHaveBeenCalledTimes(1);
    // And no heartbeat was ever started, so there is no timer to leak either.
    expect(beat).not.toHaveBeenCalled();
  });

  it("ends the response when there is nothing to watch, and starts no heartbeat", async () => {
    // No app here, no page that declared `live`, or no session. A stream held open that will never
    // speak looks exactly like one whose records stopped moving.
    const end = vi.fn();
    const beat = vi.fn(() => vi.fn());

    await holdOpen({ onClose: request().onClose, open: () => Promise.resolve({ ok: false }), beat, end });

    expect(end).toHaveBeenCalledTimes(1);
    expect(beat).not.toHaveBeenCalled();
  });
});
