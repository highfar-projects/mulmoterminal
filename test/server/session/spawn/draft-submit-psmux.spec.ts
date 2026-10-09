// @vitest-environment node
import { describe, it, expect, vi, afterEach } from "vitest";
import { attachDraftInjection, draftSubmitDelayMs } from "../../../../server/session/spawn/draft-injection.js";
import * as tmux from "../../../../server/infra/tmux.js";

// Fork-only: behind psmux the submitting Enter has to wait until psmux has handed the bracketed
// paste to the pane, or it lands inside the paste and the auto-run prompt is never sent.
describe("draftSubmitDelayMs", () => {
  it("waits a full second for a session behind psmux", () => {
    expect(draftSubmitDelayMs({ tmux: true }, true)).toBe(1000);
  });

  it("keeps upstream's short beat for real tmux and for a session with no multiplexer", () => {
    expect(draftSubmitDelayMs({ tmux: true }, false)).toBe(150);
    expect(draftSubmitDelayMs({ tmux: false }, true)).toBe(150);
    expect(draftSubmitDelayMs({}, true)).toBe(150);
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
