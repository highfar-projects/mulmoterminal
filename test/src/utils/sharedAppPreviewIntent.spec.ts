// The pane's side of a member's write, with no frame around it.
//
// The component spec proves the WIRING — the port reaches this and its answer reaches the page.
// What is pinned here is everything that happens after: which asks are sent at all, what is put in
// the log about each outcome, and that a page waiting on a promise is always answered.
//
// That last one is the reason this module exists rather than a `catch` somewhere. An intent is
// answered on a port, into a promise the page usually does not await, so a request that is dropped
// is — to the person looking at the screen — a button that did nothing. Every branch below returns
// something, including the one where the request threw.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createIntentSender, askedIntent } from "../../../src/utils/sharedAppPreviewIntent";
import type { PreviewLogEvent } from "../../../src/utils/sharedAppPreviewLog";
import type { PreviewPage } from "../../../common/sharedAppPreview";

const DESK: PreviewPage = { id: "desk", html: "<div></div>", audience: "member", viewer: { me: "owner@example.com", can: {} } };

const INTENT = { type: "mc-public-view:intent", requestId: "r1", kind: "transition", cid: "questions", itemId: "q1", to: "open" };

/** The sender, with the four things it is given recorded rather than performed.
 *
 *  `current` is what `refresh` answers: whether the screen really is up to date afterwards. It is
 *  false in the one test that needs it and true everywhere else, because a refresh that quietly
 *  failed is the difference between a move being acknowledged and the page being able to believe
 *  what it is drawing. */
const sender = (answer: unknown, page: PreviewPage | null = DESK, current = true) => {
  const remembered: PreviewLogEvent[] = [];
  let refreshed = 0;
  const fetcher = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(answer) });
  vi.stubGlobal("fetch", fetcher);
  const perform = createIntentSender({
    page: () => page,
    url: () => "/api/shared-app/preview/intent",
    remember: (event) => remembered.push(event),
    refresh: () => {
      refreshed += 1;
      return Promise.resolve(current);
    },
  });
  return { perform, remembered, fetcher, refreshedCount: () => refreshed };
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("askedIntent", () => {
  it("carries the page it was asked from, which is what decides who may make the move", () => {
    // Without it the server has nothing to judge against but the cid — and a participant's page
    // could then reach the front desk's transitions by naming the collection they live in.
    expect(askedIntent(INTENT, DESK)).toEqual({
      requestId: "r1",
      page: { id: "desk", audience: "member" },
      kind: "transition",
      cid: "questions",
      itemId: "q1",
      to: "open",
    });
  });

  it("reads no intent out of a withdrawal carrying a destination", () => {
    // A withdrawal moves nothing — the row is removed. One that arrives with a `to` is not a
    // withdrawal with decoration; it is an ask this parent cannot describe.
    expect(askedIntent({ ...INTENT, kind: "withdraw", to: "open" }, DESK)).toBeNull();
    expect(askedIntent({ ...INTENT, kind: "withdraw", to: undefined }, DESK)).not.toBeNull();
  });

  it("answers nothing for a request nobody is waiting on", () => {
    // An empty id is nobody waiting, and replying would be answering something nobody asked — the
    // package draws the same line in `answerId`.
    expect(askedIntent({ ...INTENT, requestId: "" }, DESK)).toBeNull();
    expect(askedIntent({ ...INTENT, type: "mc-public-view:submit" }, DESK)).toBeNull();
    expect(askedIntent({ ...INTENT, kind: "delete" }, DESK)).toBeNull();
  });
});

describe("the pane's intent sender", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("answers the id the page is waiting on, which never leaves this machine", async () => {
    const { perform, fetcher, refreshedCount } = sender({ ok: true, mailed: false });

    expect(await perform(INTENT)).toEqual({ requestId: "r1", ok: true });
    // The server is told what to DO, not what to reply on: a route that answered directly would be
    // inventing an id for a promise it cannot see.
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).not.toHaveProperty("requestId");
    // The records the page holds are now older than the truth, and it redraws from its own answer.
    expect(refreshedCount()).toBe(1);
  });

  it("hands the refusal back BY NAME, and writes it where the author can read it", async () => {
    const { perform, remembered } = sender({ ok: false, error: "illegal-transition" });

    expect(await perform(INTENT)).toEqual({ requestId: "r1", ok: false, error: "illegal-transition" });
    // The screen shows none of this — the page is handed it on the port and usually does not draw
    // it — so the log is the only account of the refusal there is.
    expect(remembered).toEqual([
      { kind: "intent", intent: "transition", audience: "member", cid: "questions", itemId: "q1", to: "open", error: "illegal-transition" },
    ]);
  });

  it("never puts an assignee's address in the log, though it does send it", async () => {
    // The address has to REACH the server — it is the whole of what an assignment asks for — and it
    // must not reach the copyable block, which is built to be pasted somewhere else. Both halves
    // are asserted here, because a fix that dropped it from the request would be the other bug.
    const { perform, remembered, fetcher } = sender({ ok: true, mailed: false });

    await perform({ ...INTENT, kind: "assign", to: "staff@example.com" });

    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)).to).toBe("staff@example.com");
    expect(remembered[0]).not.toHaveProperty("to");
    expect(JSON.stringify(remembered)).not.toContain("staff@example.com");
  });

  it("says a notice went out, because that is the part nothing can take back", async () => {
    const { perform, remembered } = sender({ ok: true, mailed: true });

    await perform(INTENT);

    expect(remembered[0]).toEqual(expect.objectContaining({ error: null, mailed: true }));
  });

  it("answers a request that threw, rather than leaving the page on a dead button", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("connection lost")));
    const remembered: PreviewLogEvent[] = [];
    const perform = createIntentSender({
      page: () => DESK,
      url: () => "/api/shared-app/preview/intent",
      remember: (event) => remembered.push(event),
      refresh: () => Promise.resolve(true),
    });

    expect(await perform(INTENT)).toEqual({ requestId: "r1", ok: false, error: "intent-failed" });
    // And it does not claim to know what happened. Unlike a submission there is nothing to remember
    // the move BY — a transition creates no document the pane could later offer to take back.
    expect(remembered[0]).toEqual(expect.objectContaining({ error: expect.stringContaining("may or may not have moved") }));
  });

  it("tries the re-read again before calling the screen stale", async () => {
    // The failure being recovered from is a blip — a request that timed out, a server restarted
    // between the write and the read. One more attempt turns most of them into a screen that is
    // simply correct, which is the half of this a host can fix: the wire answer belongs to
    // production, the screen does not.
    const remembered: PreviewLogEvent[] = [];
    let attempts = 0;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true, mailed: false }) }));
    const perform = createIntentSender({
      page: () => DESK,
      url: () => "/api/shared-app/preview/intent",
      remember: (event) => remembered.push(event),
      refresh: () => {
        attempts += 1;
        return Promise.resolve(attempts > 1);
      },
    });

    expect(await perform(INTENT)).toEqual({ requestId: "r1", ok: true });
    expect(attempts).toBe(2);
    // Recovered, so nothing is claimed about a stale screen — the second read installed one.
    expect(remembered.filter((event) => event.kind === "host")).toEqual([]);
  });

  it("says the SCREEN is stale when the re-read failed, and still reports the write as done", async () => {
    // Both halves matter and they point opposite ways. The write HAPPENED, so answering `ok: false`
    // would put the operator in front of a button they would press again — a second transition, and
    // a second notice, about a move that already succeeded. What is wrong is the screen, so the
    // screen is what is reported: without this the pane acknowledges a move over records that never
    // changed, and the page goes on drawing the control it has just used.
    const { perform, remembered } = sender({ ok: true, mailed: false }, DESK, false);

    expect(await perform(INTENT)).toEqual({ requestId: "r1", ok: true });
    expect(remembered[0]).toEqual(expect.objectContaining({ kind: "intent", error: null }));
    expect(remembered[1]).toEqual(expect.objectContaining({ kind: "host", note: expect.stringContaining("twice") }));
  });

  it("sends nothing at all when there is no page, or the page is a public one", async () => {
    const nowhere = sender({ ok: true, mailed: false }, null);
    expect(await nowhere.perform(INTENT)).toBeNull();
    expect(nowhere.fetcher).not.toHaveBeenCalled();

    // A public page has no reader and no roles for a move to be judged against. Null rather than a
    // refusal: the parent that answers a public page is a different one, and this reaching it at
    // all would be the bug.
    const open = sender({ ok: true, mailed: false }, { id: "public", html: "<p></p>", audience: "public" });
    expect(await open.perform(INTENT)).toBeNull();
    expect(open.fetcher).not.toHaveBeenCalled();
  });
});
