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
    const begin = vi.fn();

    await holdOpen({
      onClose: req.onClose,
      open: () => Promise.resolve({ ok: true, watching: ["messages"], stop }),
      begin,
      beat,
      nothing: vi.fn(),
    });

    expect(begin).toHaveBeenCalledTimes(1);
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

    const begin = vi.fn();
    const held = holdOpen({ onClose: req.onClose, open: () => opening, begin, beat, nothing: vi.fn() });
    req.close();
    answer[0]?.({ ok: true, watching: ["messages"], stop });
    await held;

    expect(stop).toHaveBeenCalledTimes(1);
    // And nothing was started for it: no heartbeat to leak, and no response begun for a request
    // that has already gone.
    expect(beat).not.toHaveBeenCalled();
    expect(begin).not.toHaveBeenCalled();
  });

  it("answers terminally when there is nothing to watch, without beginning a stream", async () => {
    // No app here, no page that declared `live`, or no session. Beginning a stream and ending it is
    // what an `EventSource` reconnects to — for ever, recomputing the whole preview each time,
    // which is the poll this feature exists to avoid arriving through the error path.
    const nothing = vi.fn();
    const begin = vi.fn();
    const beat = vi.fn(() => vi.fn());

    await holdOpen({ onClose: request().onClose, open: () => Promise.resolve({ ok: false }), begin, beat, nothing });

    expect(nothing).toHaveBeenCalledTimes(1);
    expect(begin).not.toHaveBeenCalled();
    expect(beat).not.toHaveBeenCalled();
  });

  it("says nothing at all to a request that closed before the answer came", async () => {
    // Writing a status onto a response whose request has gone is an error on some servers and a
    // no-op on others; either way there is nobody to read it.
    const req = request();
    const nothing = vi.fn();
    const answer: ((handle: { ok: false }) => void)[] = [];
    const opening = new Promise<{ ok: false }>((resolve) => answer.push(resolve));

    const held = holdOpen({ onClose: req.onClose, open: () => opening, begin: vi.fn(), beat: vi.fn(() => vi.fn()), nothing });
    req.close();
    answer[0]?.({ ok: false });
    await held;

    expect(nothing).not.toHaveBeenCalled();
  });
});
