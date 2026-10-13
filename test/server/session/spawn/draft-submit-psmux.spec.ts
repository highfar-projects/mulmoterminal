// @vitest-environment node
import { describe, it, expect, vi, afterEach } from "vitest";
import { attachDraftInjection, draftSubmitDelayMs } from "../../../../server/session/spawn/draft-injection.js";
import * as tmux from "../../../../server/infra/process/tmux.js";

// Fork-only: behind psmux the submitting Enter has to wait until psmux has handed the bracketed
// paste to the pane, or it lands inside the paste and the auto-run prompt is never sent.
describe("draftSubmitDelayMs", () => {
  it("waits a full second for a session behind psmux on the default input route", () => {
    expect(draftSubmitDelayMs({ tmux: true }, true, false)).toBe(1000);
  });

  // The VT input route keeps the paste markers, so the CR cannot land inside the paste.
  it("goes back to the short beat when psmux is on the VT input route", () => {
    expect(draftSubmitDelayMs({ tmux: true }, true, true)).toBe(150);
  });

  it("keeps upstream's short beat for real tmux and for a session with no multiplexer", () => {
    expect(draftSubmitDelayMs({ tmux: true }, false, false)).toBe(150);
    expect(draftSubmitDelayMs({ tmux: false }, true, false)).toBe(150);
    expect(draftSubmitDelayMs({}, true, false)).toBe(150);
  });
});

describe("an auto-run prompt behind psmux", () => {
  afterEach(() => vi.useRealTimers());

  it("is not submitted at 150 ms, and is submitted once the longer delay has passed", () => {
    vi.useFakeTimers();
    const psmux = vi.spyOn(tmux, "tmuxIsPsmux").mockReturnValue(true);
    const writes: string[] = [];
    const feed = attachDraftInjection(
      { agent: "claude", tmux: true, term: { write: (d: string) => void writes.push(d) } },
      "translate this",
      undefined,
      () => "\r",
    );
    feed("? for shortcuts");
    vi.advanceTimersByTime(250); // DRAFT_SETTLE_MS: the paste goes out
    expect(writes).toHaveLength(1);
    vi.advanceTimersByTime(150);
    expect(writes).toHaveLength(1);
    vi.advanceTimersByTime(850);
    expect(writes).toEqual([writes[0], "\r"]);
    psmux.mockRestore();
  });
});
