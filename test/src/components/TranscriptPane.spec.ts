import { describe, it, expect, vi, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import TranscriptPane from "../../../src/components/TranscriptPane.vue";

// #2112. The pane reads the agent's own transcript instead of the terminal's screen, and pages
// BACKWARDS through it — so the two things worth pinning are that a page is asked for with the
// cursor the last one answered with, and that prepending it does not move the reader.

const turn = (at: string, ...rows: { kind: string; text: string; clipped?: boolean; call?: boolean }[]) => ({ at, rows });

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
  it("frames each speaker separately, and names them", async () => {
    vi.stubGlobal("fetch", mockFetch(page([turn("2026-09-17T01:00:00.000Z", { kind: "user", text: "ask" }, { kind: "assistant", text: "answer" })], null)));
    const w = mountPane({ agent: "claude" });
    await flushPromises();
    expect(w.findAll('[data-testid="transcript-turn"]')).toHaveLength(1);
    const blocks = w.findAll('[data-testid="transcript-block"]');
    expect(blocks.map((b) => b.attributes("data-kind"))).toEqual(["user", "assistant"]);
    expect(w.findAll('[data-testid="transcript-speaker"]').map((n) => n.text())).toEqual(["You", "Claude"]);
    expect(w.get('[data-testid="transcript-text"]').text()).toBe("ask");
    expect(w.get('[data-testid="transcript-md"]').text()).toContain("answer");
  });

  it("falls back to a generic name when the cell does not say which agent it is", async () => {
    vi.stubGlobal("fetch", mockFetch(page([turn("2026-09-17T01:00:00.000Z", { kind: "assistant", text: "hi" })], null)));
    const w = mountPane({ agent: null });
    await flushPromises();
    expect(w.get('[data-testid="transcript-speaker"]').text()).toBe("Agent");
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

  // A page is a line budget over WHOLE turns, so a session whose newest turns are small opens on a
  // page holding those alone — with the turn that has the work in it evicted just above. Measured on
  // this repo's own session: a bare queued prompt and one short exchange, and nothing else on screen.
  it("keeps fetching older pages until there is a screenful", async () => {
    const fetchMock = mockFetch(
      page([turn("2026-09-17T18:34:00.000Z", { kind: "user", text: "merge" })], "f:900"),
      page([turn("2026-09-17T10:55:00.000Z", { kind: "assistant", text: "the turn with the work in it" })], "f:400"),
      page([turn("2026-09-17T09:00:00.000Z", { kind: "assistant", text: "older still" })], "f:100"),
    );
    vi.stubGlobal("fetch", fetchMock);
    const w = mountPane();
    const scroller = w.get('[data-testid="transcript-scroll"]').element as HTMLElement;
    // A viewport that two turns fill and one does not, so the fill stops on its own rather than on
    // its bound: 200px tall wants 300px of content (1.5 screens), and a turn is 200px.
    Object.defineProperty(scroller, "clientHeight", { configurable: true, get: () => 200 });
    fakeLayout(scroller); // 200px per turn
    await flushPromises();
    await flushPromises(); // the fill is a second round trip
    expect(w.findAll('[data-testid="transcript-turn"]')).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not fill past a viewport that is already full", async () => {
    const fetchMock = mockFetch(
      page([turn("2026-09-17T18:34:00.000Z", { kind: "user", text: "a long turn" })], "f:900"),
      page([turn("2026-09-17T10:55:00.000Z", { kind: "assistant", text: "should not be asked for" })], null),
    );
    vi.stubGlobal("fetch", fetchMock);
    const w = mountPane();
    const scroller = w.get('[data-testid="transcript-scroll"]').element as HTMLElement;
    Object.defineProperty(scroller, "clientHeight", { configurable: true, get: () => 100 });
    fakeLayout(scroller); // one turn is already 200px
    await flushPromises();
    await flushPromises();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // The fill runs for a moment after the pane opens. A reader who has already started scrolling up in
  // that window must keep their place — being dragged back to the newest turn is the same failure as
  // an unanchored prepend, arriving by another route.
  it("does not drag a reader back to the bottom while it fills", async () => {
    const fetchMock = mockFetch(
      page([turn("2026-09-17T18:34:00.000Z", { kind: "user", text: "merge" })], "f:900"),
      page([turn("2026-09-17T10:55:00.000Z", { kind: "assistant", text: "older" })], "f:400"),
    );
    vi.stubGlobal("fetch", fetchMock);
    const w = mountPane();
    const scroller = w.get('[data-testid="transcript-scroll"]').element as HTMLElement;
    Object.defineProperty(scroller, "clientHeight", { configurable: true, get: () => 200 });
    fakeLayout(scroller);
    await flushPromises();
    scroller.scrollTop = 0; // the reader has walked away from the end
    await flushPromises();
    await flushPromises();
    // Still where they left it, plus whatever the prepend added above — never back at the end.
    expect(scroller.scrollTop).toBeLessThan(scroller.scrollHeight - scroller.clientHeight);
  });

  // A session made entirely of tiny turns must not walk itself to the head the moment it opens.
  it("gives up filling after a few pages", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(page([turn("2026-09-17T10:00:00.000Z", { kind: "user", text: "tiny" })], "f:1")),
    });
    vi.stubGlobal("fetch", fetchMock);
    const w = mountPane();
    const scroller = w.get('[data-testid="transcript-scroll"]').element as HTMLElement;
    Object.defineProperty(scroller, "clientHeight", { configurable: true, get: () => 100000 });
    fakeLayout(scroller);
    for (let round = 0; round < 8; round++) await flushPromises();
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(6); // the first page plus the fill's bound
    expect(fetchMock.mock.calls.length).toBeGreaterThan(1); // and it did fill, or this proves nothing
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

  // What an agent writes IS markdown — headings, tables, fenced code — and showing the characters
  // instead of the document is what made the first cut of this pane hard to read.
  it("renders a reply as markdown, code fences included", async () => {
    const reply = ["## Heading", "", "Some **bold** text.", "", "```ts", "const x = 1;", "```", "", "| a | b |", "|---|---|", "| 1 | 2 |"].join("\n");
    vi.stubGlobal("fetch", mockFetch(page([turn("2026-09-17T01:00:00.000Z", { kind: "assistant", text: reply })], null)));
    const w = mountPane();
    await flushPromises();
    const html = w.get('[data-testid="transcript-md"]').html();
    expect(html).toContain("<h2");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<pre><code");
    expect(html).toContain("<table>");
  });

  // The markdown comes from an agent, so it reaches the DOM through a sanitizer — the same reason
  // the wiki's page bodies do.
  it("strips a script out of a reply", async () => {
    const reply = "before<script>window.pwned = 1</script>after";
    vi.stubGlobal("fetch", mockFetch(page([turn("2026-09-17T01:00:00.000Z", { kind: "assistant", text: reply })], null)));
    const w = mountPane();
    await flushPromises();
    const html = w.get('[data-testid="transcript-md"]').html();
    expect(html).not.toContain("<script");
    expect(html).toContain("before");
  });

  // A PROMPT is what a person typed. Rendering it as markdown would turn a line that opens with `#`
  // into a heading nobody asked for.
  it("leaves a prompt as the characters that were typed", async () => {
    vi.stubGlobal("fetch", mockFetch(page([turn("2026-09-17T01:00:00.000Z", { kind: "user", text: "# not a heading\n**not bold**" })], null)));
    const w = mountPane();
    await flushPromises();
    expect(w.find('[data-testid="transcript-md"]').exists()).toBe(false);
    expect(w.get('[data-testid="transcript-text"]').text()).toContain("# not a heading");
  });

  // A turn's tool traffic is most of its bulk and almost none of what a reader came back for.
  it("collapses tool frames, saying what ran, and opens one on request", async () => {
    const rows = [
      { kind: "tool", text: "Bash ls", call: true },
      { kind: "tool", text: "total 12" },
      { kind: "tool", text: "Read src/index.ts", call: true },
    ];
    vi.stubGlobal("fetch", mockFetch(page([turn("2026-09-17T01:00:00.000Z", ...rows)], null)));
    const w = mountPane();
    await flushPromises();
    expect(w.get('[data-testid="transcript-tool-label"]').text()).toBe("Bash ls · Read src/index.ts");
    expect(w.find('[data-testid="transcript-tool"]').exists()).toBe(false);
    await w.get('[data-testid="transcript-tool-toggle"]').trigger("click");
    expect(w.findAll('[data-testid="transcript-tool"]').map((n) => n.text())).toEqual(["Bash ls", "total 12", "Read src/index.ts"]);
    await w.get('[data-testid="transcript-tool-toggle"]').trigger("click");
    expect(w.find('[data-testid="transcript-tool"]').exists()).toBe(false);
  });

  it("marks a clipped row where it was cut", async () => {
    vi.stubGlobal("fetch", mockFetch(page([turn("2026-09-17T01:00:00.000Z", { kind: "tool", text: "head of the output", clipped: true })], null)));
    const w = mountPane();
    await flushPromises();
    await w.get('[data-testid="transcript-tool-toggle"]').trigger("click");
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

  // An older-page fetch in flight when the pane follows the zoom elsewhere fails its own request
  // check and never clears the flag it set. Left set, the NEW cell's pane silently never pages.
  it("can still page after the cell changed under an in-flight older-page fetch", async () => {
    const fetchMock = mockFetch(
      page([turn("2026-09-17T01:00:00.000Z", { kind: "user", text: "first cell" })], "f:10"),
      page([turn("2026-09-17T00:30:00.000Z", { kind: "user", text: "older of the first" })], "f:5"),
      page([turn("2026-09-17T02:00:00.000Z", { kind: "user", text: "second cell" })], "f:20"),
      page([turn("2026-09-17T01:30:00.000Z", { kind: "user", text: "older of the second" })], null),
    );
    vi.stubGlobal("fetch", fetchMock);
    const w = mountPane();
    await flushPromises();
    const scroller = w.get('[data-testid="transcript-scroll"]').element as HTMLElement;
    fakeLayout(scroller);
    scroller.scrollTop = 0;
    scroller.dispatchEvent(new Event("scroll")); // not awaited: the switch happens under it
    await w.setProps({ sessionId: "s2" });
    await flushPromises();
    scroller.scrollTop = 0;
    await scroller.dispatchEvent(new Event("scroll"));
    await flushPromises();
    expect(w.findAll('[data-testid="transcript-text"]').map((n) => n.text())).toEqual(["older of the second", "second cell"]);
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
