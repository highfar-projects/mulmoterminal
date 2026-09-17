import { describe, it, expect, vi, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import TranscriptPane from "../../../src/components/TranscriptPane.vue";

// #2112. The pane reads the agent's own transcript instead of the terminal's screen, and pages
// BACKWARDS through it — so the two things worth pinning are that a page is asked for with the
// cursor the last one answered with, and that prepending it does not move the reader.

const turn = (at: string, ...rows: { kind: string; text: string; clipped?: boolean }[]) => ({ at, rows });

const page = (turns: unknown[], older: string | null, status = "ok") => ({ view: { status, turns, truncated: false }, older });

/** One fetch response per call, in order — the pane makes exactly one request per page. */
const mockFetch = (...payloads: unknown[]) => {
  const fn = vi.fn();
  payloads.forEach((payload) => fn.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(payload) }));
  return fn;
};

const mountPane = (props: Record<string, unknown> = {}) =>
  mount(TranscriptPane, { props: { sessionId: "s1", cwd: "/repo", ...props }, attachTo: document.body });

/** jsdom lays nothing out, so `scrollHeight` is 0 forever and the correction under test would be a
 *  no-op. Height is made proportional to the turns rendered instead: prepending a turn grows the
 *  element by exactly one turn's worth, which is the relationship the correction exists to cancel. */
const TURN_PX = 200;
const fakeLayout = (el: HTMLElement): void => {
  Object.defineProperty(el, "scrollHeight", {
    configurable: true,
    get: () => el.querySelectorAll('[data-testid="transcript-turn"]').length * TURN_PX,
  });
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals(); // restoreAllMocks does not undo stubGlobal (CodeRabbit, #1749)
});

describe("TranscriptPane", () => {
  it("shows the session's turns, and says which speaker each row is", async () => {
    vi.stubGlobal("fetch", mockFetch(page([turn("2026-09-17T01:00:00.000Z", { kind: "user", text: "ask" }, { kind: "assistant", text: "answer" })], null)));
    const w = mountPane();
    await flushPromises();
    expect(w.findAll('[data-testid="transcript-turn"]')).toHaveLength(1);
    expect(w.findAll('[data-testid="transcript-text"]').map((n) => n.text())).toEqual(["ask", "answer"]);
  });

  it("asks for THIS cell's session and directory", async () => {
    const fetchMock = mockFetch(page([], null));
    vi.stubGlobal("fetch", fetchMock);
    mountPane({ sessionId: "abc", cwd: "/w" });
    await flushPromises();
    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).toContain("session=abc");
    expect(url).toContain(encodeURIComponent("/w"));
    expect(url).not.toContain("before=");
  });

  it("asks for the page before, with the cursor the last page answered with", async () => {
    const fetchMock = mockFetch(page([turn("2026-09-17T01:00:00.000Z", { kind: "user", text: "newer" })], "f:4096"), page([], null));
    vi.stubGlobal("fetch", fetchMock);
    const w = mountPane();
    await flushPromises();
    const scroller = w.get('[data-testid="transcript-scroll"]').element as HTMLElement;
    fakeLayout(scroller);
    scroller.scrollTop = 0;
    await scroller.dispatchEvent(new Event("scroll"));
    await flushPromises();
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("before=f%3A4096");
  });

  // THE ONE THAT MAKES THE FEATURE USABLE. Content added above the viewport pushes everything down,
  // so without the correction every page throws the reader away from the line they scrolled back to
  // find — which is the only line they were looking for.
  it("keeps the reader where they were when older turns are prepended", async () => {
    const fetchMock = mockFetch(
      page([turn("2026-09-17T01:00:00.000Z", { kind: "user", text: "newer" })], "f:4096"),
      page([turn("2026-09-17T00:00:00.000Z", { kind: "user", text: "older" })], null),
    );
    vi.stubGlobal("fetch", fetchMock);
    const w = mountPane();
    await flushPromises();
    const scroller = w.get('[data-testid="transcript-scroll"]').element as HTMLElement;
    fakeLayout(scroller);
    scroller.scrollTop = 30;
    await scroller.dispatchEvent(new Event("scroll"));
    await flushPromises();
    // The older turn went ABOVE, and the reader is the same distance from the line they were on.
    expect(w.findAll('[data-testid="transcript-text"]').map((n) => n.text())).toEqual(["older", "newer"]);
    expect(scroller.scrollTop).toBe(30 + TURN_PX);
  });

  it("stops asking once the head of the transcript is reached", async () => {
    const fetchMock = mockFetch(page([turn("2026-09-17T01:00:00.000Z", { kind: "user", text: "only" })], null));
    vi.stubGlobal("fetch", fetchMock);
    const w = mountPane();
    await flushPromises();
    const scroller = w.get('[data-testid="transcript-scroll"]').element as HTMLElement;
    fakeLayout(scroller);
    scroller.scrollTop = 0;
    await scroller.dispatchEvent(new Event("scroll"));
    await flushPromises();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(w.text()).toContain("The start of this conversation.");
  });

  it("keeps a fenced code block monospace instead of wrapping it as prose", async () => {
    const reply = ["Here:", "```ts", "const x = 1;", "```", "done"].join("\n");
    vi.stubGlobal("fetch", mockFetch(page([turn("2026-09-17T01:00:00.000Z", { kind: "assistant", text: reply })], null)));
    const w = mountPane();
    await flushPromises();
    expect(w.findAll('[data-testid="transcript-code"]').map((n) => n.text())).toEqual(["const x = 1;"]);
    expect(w.findAll('[data-testid="transcript-text"]').map((n) => n.text())).toEqual(["Here:", "done"]);
  });

  it("renders a tool row as output rather than as prose", async () => {
    vi.stubGlobal("fetch", mockFetch(page([turn("2026-09-17T01:00:00.000Z", { kind: "tool", text: "Bash", clipped: true })], null)));
    const w = mountPane();
    await flushPromises();
    expect(w.get('[data-testid="transcript-tool"]').text()).toBe("Bash");
    expect(w.text()).toContain("cut here");
  });

  // Each status is a different thing to tell a person, which is why the server sends four of them
  // rather than a boolean — a pane that collapsed them would send a reader looking in the wrong place.
  it.each([
    ["cleared", "/clear"],
    ["not-supported", "can't read yet"],
    ["too-large", "too large"],
    ["none", "Nothing written"],
  ])("explains %s in its own words", async (status, expected) => {
    vi.stubGlobal("fetch", mockFetch(page([], null, status)));
    const w = mountPane();
    await flushPromises();
    expect(w.get('[data-testid="transcript-empty"]').text()).toContain(expected);
  });

  it("says so when the read itself failed", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500, json: () => Promise.resolve({}) }));
    const w = mountPane();
    await flushPromises();
    expect(w.get('[data-testid="transcript-empty"]').text()).toContain("Couldn't read");
  });

  // The pane stays mounted while the grid walks the zoom from cell to cell, so a changed session has
  // to replace what is shown rather than leave another terminal's conversation under a new header.
  it("reloads when the cell it is following changes", async () => {
    const fetchMock = mockFetch(
      page([turn("2026-09-17T01:00:00.000Z", { kind: "user", text: "first cell" })], "f:10"),
      page([turn("2026-09-17T02:00:00.000Z", { kind: "user", text: "second cell" })], null),
    );
    vi.stubGlobal("fetch", fetchMock);
    const w = mountPane();
    await flushPromises();
    await w.setProps({ sessionId: "s2" });
    await flushPromises();
    expect(w.findAll('[data-testid="transcript-text"]').map((n) => n.text())).toEqual(["second cell"]);
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("session=s2");
  });
});
