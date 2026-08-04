// The one bounded fetch (#1393). What is pinned here is the part a hand-written copy got wrong or
// left out: composing the caller's own signal, and clearing the timer on the failure path.
import { describe, it, expect, vi, afterEach } from "vitest";

import { fetchWithTimeout, DEFAULT_REQUEST_TIMEOUT_MS } from "../../../src/utils/fetchWithTimeout";

/** A fetch that never answers, recording the signal it was handed. */
function hangingFetch(): { signals: AbortSignal[] } {
  const signals: AbortSignal[] = [];
  vi.stubGlobal("fetch", (_input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.signal) signals.push(init.signal);
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    });
  });
  return { signals };
}

const ok = () => ({ ok: true, status: 200 }) as Response;

describe("fetchWithTimeout", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("answers normally when the server does", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ok()),
    );
    expect((await fetchWithTimeout("/api/thing")).ok).toBe(true);
  });

  it("gives up at the default deadline", async () => {
    vi.useFakeTimers();
    hangingFetch();
    // Asserted BEFORE the clock moves: attaching the handler afterwards leaves a moment where the
    // promise rejects with nothing listening, which Node reports as an unhandled rejection. It
    // survived locally and failed on CI, where the ordering is not the same.
    const settled = expect(fetchWithTimeout("/api/thing")).rejects.toThrow(/abort/i);
    await vi.advanceTimersByTimeAsync(DEFAULT_REQUEST_TIMEOUT_MS);
    await settled;
  });

  // The reason this takes a parameter at all: the same codebase runs 90s for an LLM summary and
  // 300s for an upload, and the default would abort both.
  it("waits the whole of a longer deadline the caller asked for", async () => {
    vi.useFakeTimers();
    hangingFetch();
    const pending = fetchWithTimeout("/api/slow", undefined, 90_000);
    let done = false;
    const settled = pending.then(
      () => (done = true),
      () => (done = true),
    );
    await vi.advanceTimersByTimeAsync(DEFAULT_REQUEST_TIMEOUT_MS + 1);
    expect(done).toBe(false); // still going, where the default would have given up
    await vi.advanceTimersByTimeAsync(90_000);
    await settled;
    expect(done).toBe(true);
  });

  // A composable cancels on unmount by passing its own signal. Overwriting it would leave the
  // request running after the component that wanted it is gone.
  // Fake timers held STILL on purpose: with them running, the default deadline fires on its own
  // after 8s and the test passes whether or not the caller's signal was kept. Frozen, the only
  // thing that can settle this request is the caller — which is the thing being asserted.
  it("still honours the caller's own signal", async () => {
    vi.useFakeTimers();
    hangingFetch();
    const caller = new AbortController();
    const settled = expect(fetchWithTimeout("/api/thing", { signal: caller.signal })).rejects.toThrow(/abort/i);
    caller.abort();
    await settled;
  });

  it("keeps the caller's signal AND the deadline, whichever comes first", async () => {
    vi.useFakeTimers();
    hangingFetch();
    const caller = new AbortController(); // never fired
    const settled = expect(fetchWithTimeout("/api/thing", { signal: caller.signal })).rejects.toThrow(/abort/i);
    await vi.advanceTimersByTimeAsync(DEFAULT_REQUEST_TIMEOUT_MS);
    await settled;
  });

  it("passes the caller's method and body through untouched", async () => {
    const seen: RequestInit[] = [];
    vi.stubGlobal("fetch", async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init) seen.push(init);
      return ok();
    });
    await fetchWithTimeout("/api/thing", { method: "POST", body: "{}", headers: { "content-type": "application/json" } });
    expect(seen[0]?.method).toBe("POST");
    expect(seen[0]?.body).toBe("{}");
  });

  // A pending timer on a request that already failed would abort a controller nobody is listening
  // to, and on a long deadline it keeps a handle alive for that whole time.
  it("clears the timer when the request fails rather than times out", async () => {
    vi.useFakeTimers();
    const cleared = vi.spyOn(globalThis, "clearTimeout");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new TypeError("network down"))),
    );
    await expect(fetchWithTimeout("/api/thing")).rejects.toThrow(/network down/);
    expect(cleared).toHaveBeenCalled();
    cleared.mockRestore();
  });

  it("clears the timer when the request succeeds", async () => {
    vi.useFakeTimers();
    const cleared = vi.spyOn(globalThis, "clearTimeout");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ok()),
    );
    await fetchWithTimeout("/api/thing");
    expect(cleared).toHaveBeenCalled();
    cleared.mockRestore();
  });
});
