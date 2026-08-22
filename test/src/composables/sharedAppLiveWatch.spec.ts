// A previewed page that WATCHES its records, and the one place it used to stand still.
//
// The pane read the records once and refreshed after the author's own write, so a page declaring
// `live` — a chat room, a live poll's audience screen — showed nothing when somebody ELSE wrote.
// The published page moved and the preview of it did not, which reads as a broken page rather than
// as a preview that does not watch.

import { describe, it, expect, vi, afterEach } from "vitest";
import { effectScope, ref } from "vue";

import { LIVE_POLL_MS, keepWatchedPageCurrent, watchesRecords } from "../../../src/composables/sharedAppLiveWatch";
import type { PreviewPage } from "../../../common/sharedAppPreview";

const pageOf = (live?: string[]): PreviewPage => ({
  id: "room",
  html: "<h1>Room</h1>",
  audience: "member",
  ...(live === undefined ? {} : { live }),
});

/** Run `body` inside a scope, then dispose it — which is what the pane going away does. */
const inScope = (body: () => void): (() => void) => {
  const scope = effectScope();
  scope.run(body);
  return () => scope.stop();
};

const hide = (state: "visible" | "hidden") => {
  Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
};

afterEach(() => {
  vi.useRealTimers();
  hide("visible");
});

describe("watchesRecords", () => {
  it("is what the page DECLARED, and nothing shown yet is no", () => {
    expect(watchesRecords(pageOf(["messages"]))).toBe(true);
    expect(watchesRecords(pageOf([]))).toBe(false);
    expect(watchesRecords(pageOf())).toBe(false);
    expect(watchesRecords(null)).toBe(false);
  });
});

describe("keepWatchedPageCurrent", () => {
  it("re-reads a watching page, over and over", () => {
    vi.useFakeTimers();
    const reread = vi.fn();
    const stop = inScope(() => keepWatchedPageCurrent(() => pageOf(["messages"]), reread));

    expect(reread).not.toHaveBeenCalled();
    vi.advanceTimersByTime(LIVE_POLL_MS * 3);
    expect(reread).toHaveBeenCalledTimes(3);
    stop();
  });

  it("leaves a page that watches nothing exactly as often read as before", () => {
    vi.useFakeTimers();
    const reread = vi.fn();
    const stop = inScope(() => keepWatchedPageCurrent(() => pageOf(), reread));

    vi.advanceTimersByTime(LIVE_POLL_MS * 10);
    expect(reread).not.toHaveBeenCalled();
    stop();
  });

  it("starts and stops as the author walks between pages", async () => {
    vi.useFakeTimers();
    const shown = ref<PreviewPage | null>(pageOf());
    const reread = vi.fn();
    const stop = inScope(() => keepWatchedPageCurrent(() => shown.value, reread));

    shown.value = pageOf(["messages"]);
    await Promise.resolve();
    vi.advanceTimersByTime(LIVE_POLL_MS);
    expect(reread).toHaveBeenCalledTimes(1);

    // Back to a page that watches nothing: the polling has to END, not merely be ignored.
    shown.value = pageOf();
    await Promise.resolve();
    vi.advanceTimersByTime(LIVE_POLL_MS * 5);
    expect(reread).toHaveBeenCalledTimes(1);
    stop();
  });

  it("skips a hidden window, and picks up again when it comes back", () => {
    // The reason to re-read is that somebody is LOOKING. A pane behind another window is a request
    // every few seconds for nobody — and the timer stays, so returning needs no new one.
    vi.useFakeTimers();
    const reread = vi.fn();
    const stop = inScope(() => keepWatchedPageCurrent(() => pageOf(["messages"]), reread));

    hide("hidden");
    vi.advanceTimersByTime(LIVE_POLL_MS * 4);
    expect(reread).not.toHaveBeenCalled();

    hide("visible");
    vi.advanceTimersByTime(LIVE_POLL_MS);
    expect(reread).toHaveBeenCalledTimes(1);
    stop();
  });

  it("stops when the pane goes away", () => {
    // A timer that outlived the pane would go on asking this host's server about a directory
    // nobody is looking at, for as long as the app is open.
    vi.useFakeTimers();
    const reread = vi.fn();
    const stop = inScope(() => keepWatchedPageCurrent(() => pageOf(["messages"]), reread));

    vi.advanceTimersByTime(LIVE_POLL_MS);
    expect(reread).toHaveBeenCalledTimes(1);
    stop();
    vi.advanceTimersByTime(LIVE_POLL_MS * 5);
    expect(reread).toHaveBeenCalledTimes(1);
  });
});
