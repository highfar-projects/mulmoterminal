// A previewed page that WATCHES its records, and the one place it used to stand still.
//
// The pane read the records once and re-read after the author's own write, so a page declaring
// `live` — a chat room, a live poll's audience screen — showed nothing when somebody ELSE wrote.
// The published page moved and the preview of it did not.
//
// What closed it is a stream, not a clock: the server holds the `onSnapshot` (it has the session)
// and sends one collection's rows for one page when they change. These tests drive that end.

import { describe, it, expect, vi, afterEach } from "vitest";
import { effectScope, ref } from "vue";

import { keepWatchedPageCurrent, pendingChanges, watchesRecords, withChange, withChanges } from "../../../src/composables/sharedAppLiveWatch";
import type { PreviewPage, PreviewRecordChange } from "../../../common/sharedAppPreview";

const pageOf = (live?: string[]): PreviewPage => ({
  id: "room",
  html: "<h1>Room</h1>",
  audience: "member",
  ...(live === undefined ? {} : { live }),
});

/** Every stream this file opened, so a test can speak on it and assert it was closed. */
const opened: { url: string; closed: boolean; send: (data: string) => void }[] = [];

class FakeStream {
  public onmessage: ((event: MessageEvent<string>) => void) | null = null;
  public constructor(url: string) {
    opened.push({
      url,
      closed: false,
      send: (data: string) => this.onmessage?.({ data } as MessageEvent<string>),
    });
    this.index = opened.length - 1;
  }
  private readonly index: number;
  public close(): void {
    const entry = opened[this.index];
    if (entry !== undefined) entry.closed = true;
  }
}

vi.stubGlobal("EventSource", FakeStream);

const inScope = (body: () => void): (() => void) => {
  const scope = effectScope();
  scope.run(body);
  return () => scope.stop();
};

afterEach(() => {
  opened.length = 0;
});

describe("watchesRecords", () => {
  it("is what the page DECLARED, and nothing shown yet is no", () => {
    expect(watchesRecords(pageOf(["messages"]))).toBe(true);
    expect(watchesRecords(pageOf([]))).toBe(false);
    expect(watchesRecords(pageOf())).toBe(false);
    expect(watchesRecords(null)).toBe(false);
  });
});

describe("withChange", () => {
  const held = { "member:room": { messages: [{ id: "m1" }] }, "member:ledger": { notes: [] } };

  it("replaces one collection on one page and leaves the rest alone", () => {
    const next = withChange(held, { key: "member:room", cid: "messages", rows: [{ id: "m1" }, { id: "m2" }] });
    expect(next["member:room"]?.messages).toHaveLength(2);
    expect(next["member:ledger"]).toBe(held["member:ledger"]);
    // A NEW MAP: what holds this is a `shallowRef`, so a mutation would change the records and
    // tell nobody.
    expect(next).not.toBe(held);
    expect(held["member:room"]?.messages).toHaveLength(1);
  });

  it("ignores a page the pane is not holding rather than inventing one", () => {
    const next = withChange(held, { key: "public:public", cid: "messages", rows: [{ id: "x" }] });
    expect(next).toBe(held);
  });
});

describe("withChanges", () => {
  it("puts the stream on top of an answer that was read before it", () => {
    // The race: a re-read started at T0 answers with the rows as they were at T0, so assigning that
    // answer would undo a change that arrived at T1 — and no second snapshot is coming, because
    // nothing has changed since. The preview would sit on the older rows for good.
    const readAtT0 = { "member:room": { messages: [{ id: "m1" }] } };
    const arrivedDuring = [
      { key: "member:room", cid: "messages", rows: [{ id: "m1" }, { id: "m2" }] },
      { key: "member:room", cid: "messages", rows: [{ id: "m1" }, { id: "m2" }, { id: "m3" }] },
    ];

    // Oldest first, so the last one wins — which is the one the records are actually in.
    expect(withChanges(readAtT0, arrivedDuring)["member:room"]?.messages).toHaveLength(3);
    expect(withChanges(readAtT0, [])).toBe(readAtT0);
  });
});

describe("pendingChanges", () => {
  const change = (cid: string, ids: string[]) => ({ key: "member:room", cid, rows: ids.map((id) => ({ id })) });

  it("holds nothing while no read is out", () => {
    // The whole reason this is not a list the stream appends to. A previewed chat room left open
    // for an afternoon receives a change per message; keeping them against a read that may never
    // come is memory that only grows.
    const caught = pendingChanges();
    caught.record(change("messages", ["m1"]));
    caught.record(change("messages", ["m1", "m2"]));
    expect(caught.close()).toEqual([]);
  });

  it("keeps only the latest rows per page and collection while one is", () => {
    // Every change carries the WHOLE collection, so an older one for the same pair says nothing the
    // newer one does not — and the buffer is bounded by what is watched rather than by traffic.
    const caught = pendingChanges();
    caught.open();
    caught.record(change("messages", ["m1"]));
    caught.record(change("notes", ["n1"]));
    caught.record(change("messages", ["m1", "m2"]));

    const held = caught.close();
    expect(held).toHaveLength(2);
    expect(held.find((entry) => entry.cid === "messages")?.rows).toHaveLength(2);
  });

  it("closes once, and closing again is closing nothing", () => {
    // Every way out of a read closes it — superseded, refused, threw — so the second call has to be
    // harmless rather than a way to replay the last one's changes onto the next one's answer.
    const caught = pendingChanges();
    caught.open();
    caught.record(change("messages", ["m1"]));
    expect(caught.close()).toHaveLength(1);
    expect(caught.close()).toEqual([]);
  });
});

describe("keepWatchedPageCurrent", () => {
  const streamFor = (page: PreviewPage | null, apply = vi.fn()) => {
    const shown = ref<PreviewPage | null>(page);
    const stop = inScope(() =>
      keepWatchedPageCurrent(
        () => shown.value,
        () => "/api/shared-app/preview/watch?cwd=/repo",
        apply,
      ),
    );
    return { shown, apply, stop };
  };

  it("opens one stream for a watching page and files what arrives", () => {
    const { apply, stop } = streamFor(pageOf(["messages"]));

    expect(opened).toHaveLength(1);
    expect(opened[0]?.url).toBe("/api/shared-app/preview/watch?cwd=/repo");

    const change: PreviewRecordChange = { key: "member:room", cid: "messages", rows: [{ id: "m2" }] };
    opened[0]?.send(JSON.stringify(change));
    expect(apply).toHaveBeenCalledWith(change);
    stop();
  });

  it("opens nothing for a page that watches nothing", () => {
    const { stop } = streamFor(pageOf());
    expect(opened).toHaveLength(0);
    stop();
  });

  it("survives a line it cannot read, and leaves the records alone", () => {
    // Whatever arrives is JSON from this host's own server — and a shape this pane cannot read must
    // leave the records as they are rather than throw inside a handler nobody is awaiting.
    const { apply, stop } = streamFor(pageOf(["messages"]));
    for (const line of ["not json", "null", '{"key":"member:room"}', '{"key":1,"cid":"messages","rows":[]}']) {
      opened[0]?.send(line);
    }
    expect(apply).not.toHaveBeenCalled();
    stop();
  });

  it("closes the stream when the author walks to a page that watches nothing", async () => {
    const { shown, stop } = streamFor(pageOf(["messages"]));
    shown.value = pageOf();
    await Promise.resolve();

    expect(opened[0]?.closed).toBe(true);
    expect(opened).toHaveLength(1);
    stop();
  });

  it("closes the stream when the pane goes away", () => {
    // Left open it holds a listener on this host, and a Firestore subscription behind that, for as
    // long as the app is running.
    const { stop } = streamFor(pageOf(["messages"]));
    expect(opened[0]?.closed).toBe(false);
    stop();
    expect(opened[0]?.closed).toBe(true);
  });
});
