import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import FileSearch from "../../../src/components/FileSearch.vue";

// The "search in files" panel (#2140). What a search MEANS is common/fileSearch.ts and is tested
// there; this file is about the PANEL — that it asks the right question, that it shows the one file
// the server cannot answer for, and that it says out loud when what it is showing is not everything.

/** The panel's own debounce. Mirrored here because the test has to advance PAST it and no further —
 *  see the cancellation test for what advancing further hides. */
const DEBOUNCE_MS = 180;

const DISK = [
  { path: "src/a.ts", line: 3, text: "const needle = 1;", clipped: false },
  { path: "src/a.ts", line: 9, text: "needle again", clipped: false },
  { path: "src/b.ts", line: 1, text: "another needle", clipped: false },
];

let lastUrl = "";

/** The signal handed to each fetch, so a test can watch it actually abort rather than assert that
 *  some unwired spy was not called — which passes whether or not anything works. */
const signals: (AbortSignal | undefined)[] = [];

const answering = (body: unknown, ok = true, status = 200) => {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    lastUrl = String(input);
    signals.push(init?.signal ?? undefined);
    return { ok, status, json: async () => body };
  }) as unknown as typeof fetch;
};

// jsdom implements no scrolling, so the real method is absent rather than inert.
type Scrollable = { scrollIntoView?: (arg?: unknown) => void };

/** How many context blocks were in the document each time a scroll was asked for.
 *
 *  The COUNT AT CALL TIME is the whole point: jsdom has no layout, so "did it scroll to the right
 *  place" is unobservable — but "was the row its final height yet" is, and that is the same
 *  question. A `pre`-flush watcher runs before the re-render and sees the old document. */
const blocksWhenScrolled: number[] = [];
const contextBlocksInDocument = () => document.querySelectorAll('[data-testid="file-search-context-before"]').length;

/** How many padding-top utilities one element carries. Two would BOTH apply, and which wins is
 *  decided by the order Tailwind emits them in rather than by the expression that put them there. */
const paddingTops = (classes: string[]): string[] => classes.filter((name) => name.startsWith("pt-"));

/** The panel's context debounce. Mirrored for the same reason `DEBOUNCE_MS` is: the advance has to
 *  be PRECISE. `runOnlyPendingTimers` also fires `fetchWithTimeout`'s own deadline, which aborts
 *  the read and makes the block never arrive whatever the panel does. */
const CONTEXT_DEBOUNCE_MS = 90;

/** Answer the SEARCH route as usual and the context read with `window`. Two routes rather than one
 *  mock body, because the panel now asks two different questions and a single answer to both hides
 *  which one it asked. */
const answeringContext = (window: unknown, matches: unknown = DISK) => {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    lastUrl = String(input);
    signals.push(init?.signal ?? undefined);
    const forLines = String(input).includes("/browse/lines");
    return { ok: true, status: 200, json: async () => (forLines ? window : { matches, truncated: false, source: "git" }) };
  }) as unknown as typeof fetch;
};

/** Let the context read fire and land. */
const settleContext = async () => {
  await vi.advanceTimersByTimeAsync(CONTEXT_DEBOUNCE_MS + 1);
  await flushPromises();
};

/** Every line the given row draws, as `number:text` — the context above and below included. */
const linesOf = (row: { findAll: (s: string) => { findAll: (s: string) => { text: () => string }[] }[] }) =>
  row.findAll("div").map((div) => {
    const [number, text] = div.findAll("span");
    return `${number?.text() ?? ""}:${text?.text() ?? ""}`;
  });

const realFetch = globalThis.fetch;
beforeEach(() => {
  vi.useFakeTimers();
  signals.length = 0;
  answering({ matches: DISK, truncated: false, source: "git" });
  blocksWhenScrolled.length = 0;
  (Element.prototype as Scrollable).scrollIntoView = vi.fn(() => blocksWhenScrolled.push(contextBlocksInDocument()));
});
afterEach(() => {
  vi.useRealTimers();
  globalThis.fetch = realFetch;
  delete (Element.prototype as Scrollable).scrollIntoView;
});

type Buffer = { path: string; text: string } | null;

const open = (buffer: Buffer = null) => mount(FileSearch, { props: { cwd: "/proj", buffer }, attachTo: document.body });

/** Type a query and let the debounce elapse — the panel deliberately does not ask per keystroke. */
const search = async (w: ReturnType<typeof open>, query: string) => {
  await w.find('[data-testid="file-search-input"]').setValue(query);
  await vi.runOnlyPendingTimersAsync();
  await flushPromises();
};

/** Each row as `line:text`, read from the two spans rather than from the row's concatenated text —
 *  which carries no separator and would make an assertion read like a typo.
 *
 *  Scoped to the MATCH line and not to the row: a selected row also draws the lines around the
 *  match (#2159), and reading the row's first two spans then returns a context line's number and
 *  text — which looks exactly like the row being wrong. */
const rows = (w: ReturnType<typeof open>) =>
  w.findAll('[data-testid="file-search-row"]').map((row) => {
    const [line, text] = row.find('[data-testid="file-search-match-line"]').findAll("span");
    return `${line?.text() ?? ""}:${text?.text() ?? ""}`;
  });

/** How many times the panel has asked the SEARCH route.
 *
 *  Not every `fetch`: a selected row also reads the lines around it (#2159), so counting all calls
 *  makes "did it re-search?" answer yes because something else was read. */
const searchCalls = () => vi.mocked(globalThis.fetch).mock.calls.filter(([input]) => String(input).includes("/browse/search")).length;

describe("FileSearch", () => {
  it("does not ask anything until a query is typed", async () => {
    const w = open();
    await vi.runOnlyPendingTimersAsync();
    expect(globalThis.fetch).not.toHaveBeenCalled();
    w.unmount();
  });

  // One request per settled query, not per keystroke: each one is a subprocess on the server.
  it("asks once after the debounce, not once per keystroke", async () => {
    const w = open();
    const input = w.find('[data-testid="file-search-input"]');
    await input.setValue("n");
    await input.setValue("ne");
    await input.setValue("nee");
    await vi.runOnlyPendingTimersAsync();
    await flushPromises();
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(lastUrl).toContain("q=nee");
    w.unmount();
  });

  // Clearing the box is the plainest way a user says they no longer want the result — and it was
  // the one path that left the request running, because the empty-query exit came first.
  it("cancels the running search when the query is cleared", async () => {
    const w = open();
    await search(w, "needle");
    const inFlight = signals.at(-1);
    expect(inFlight?.aborted).toBe(false); // the premise: it really was still live

    const before = searchCalls();
    await w.find('[data-testid="file-search-input"]').setValue("");
    // ONLY the debounce, never `runOnlyPendingTimers`. The signal reaching `fetch` is the panel's
    // composed with `fetchWithTimeout`'s own 60s deadline, and running every pending timer fires
    // that deadline too — which aborts the signal whatever the panel does. This assertion passed
    // against a mutant that removed the cancellation entirely until the advance was made precise.
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS + 1);
    await flushPromises();

    // The signal the server is holding goes down — which is what stops the `git grep`, now that the
    // route passes it through. Nothing new is asked, because an empty query is not a search.
    expect(inFlight?.aborted).toBe(true);
    expect(searchCalls()).toBe(before);
    expect(rows(w)).toEqual([]);
    w.unmount();
  });

  // `cwd` is a search INPUT, like the query and the modes. It did not use to be, and the pane
  // deliberately survives a re-root — so a panel left open went on showing the previous project's
  // matches, and picking one revealed that relative path under the NEW root: a different file where
  // the same path exists, nothing where it does not.
  describe("when the directory changes under it", () => {
    it("drops the previous project's rows at once, without waiting for the debounce", async () => {
      const w = open();
      await search(w, "needle");
      expect(rows(w)).not.toEqual([]); // the premise: there really were rows to lose

      await w.setProps({ cwd: "/other-project" });
      await flushPromises();
      // BEFORE any timer runs. During that window the rows are not merely stale — they belong to
      // another project, and Enter would reveal one of them under this root.
      expect(rows(w)).toEqual([]);
      w.unmount();
    });

    it("re-asks for the same query against the new directory", async () => {
      const w = open();
      await search(w, "needle");
      const before = vi.mocked(globalThis.fetch).mock.calls.length;

      await w.setProps({ cwd: "/other-project" });
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS + 1);
      await flushPromises();

      expect(vi.mocked(globalThis.fetch).mock.calls).toHaveLength(before + 1);
      expect(lastUrl).toContain("cwd=%2Fother-project");
      expect(lastUrl).toContain("q=needle");
      w.unmount();
    });
  });

  it("groups matches under their file, with the line numbers", async () => {
    const w = open();
    await search(w, "needle");
    expect(rows(w)).toEqual(["3:const needle = 1;", "9:needle again", "1:another needle"]);
    expect(w.text()).toContain("src/a.ts");
    expect(w.text()).toContain("src/b.ts");
    w.unmount();
  });

  it("emits the path AND the line, which is what makes a result worth clicking", async () => {
    const w = open();
    await search(w, "needle");
    await w.findAll('[data-testid="file-search-row"]')[1]?.trigger("click");
    expect(w.emitted("pick")?.[0]).toEqual(["src/a.ts", 9]);
    w.unmount();
  });

  // A <button> takes its accessible name from its CONTENT, so `title` alone left these announced
  // as "Aa" and ".*" — the glyphs, not what they do.
  it("names the mode toggles for a screen reader, not by their glyph", async () => {
    const w = open();
    expect(w.find('[data-testid="file-search-case"]').attributes("aria-label")).toBe("Match case");
    expect(w.find('[data-testid="file-search-regex"]').attributes("aria-label")).toBe("Regular expression");
    w.unmount();
  });

  it("carries the modes to the server only when they are on", async () => {
    const w = open();
    await search(w, "needle");
    expect(lastUrl).not.toContain("regex=");
    expect(lastUrl).not.toContain("case=");
    await w.find('[data-testid="file-search-regex"]').trigger("click");
    await vi.runOnlyPendingTimersAsync();
    await flushPromises();
    expect(lastUrl).toContain("regex=1");
    w.unmount();
  });

  // Toggling a mode has to RE-ASK: the query did not change, but what it means did, and the panel
  // would otherwise show a literal search under a regex badge.
  it("re-searches when a mode is toggled", async () => {
    const w = open();
    await search(w, "needle");
    const before = searchCalls();
    await w.find('[data-testid="file-search-case"]').trigger("click");
    await vi.runOnlyPendingTimersAsync();
    await flushPromises();
    expect(searchCalls()).toBe(before + 1);
    w.unmount();
  });

  describe("the file the disk cannot answer for", () => {
    // THE POINT of the buffer prop. The server found `needle` at line 3 of src/a.ts in the SAVED
    // file; the editor's unsaved text has it somewhere else. Showing the disk answer would jump to
    // a line describing a document the user is not looking at.
    it("replaces the open dirty file's matches with the buffer's own", async () => {
      const w = open({ path: "src/a.ts", text: "first\nsecond\nthird\nneedle in the buffer\n" });
      await search(w, "needle");
      expect(rows(w)).toEqual(["4:needle in the buffer", "1:another needle"]);
      w.unmount();
    });

    it("marks that file as unsaved, because its line numbers are not the file on disk's", async () => {
      const w = open({ path: "src/a.ts", text: "needle in the buffer\n" });
      await search(w, "needle");
      expect(w.find('[data-testid="file-search-unsaved"]').exists()).toBe(true);
      w.unmount();
    });

    // A clean file is on disk, so the disk answer is already the right one.
    // In REGEX mode the buffer is not searched at all — running an untrusted pattern on the UI
    // thread can freeze the tab, taking the unsaved buffer with it. What must still hold is the
    // half that needs no matching: the stale disk matches for that file are gone either way.
    it("does not show the buffer's matches in regex mode, and says the file went unsearched", async () => {
      const w = open({ path: "src/a.ts", text: "needle in the buffer\n" });
      await w.find('[data-testid="file-search-regex"]').trigger("click");
      await search(w, "needle");
      expect(w.find('[data-testid="file-search-buffer-skipped"]').exists()).toBe(true);
      // Neither the buffer's answer nor the stale disk one for that file.
      expect(rows(w)).toEqual(["1:another needle"]);
      w.unmount();
    });

    it("says nothing about an unsearched buffer in literal mode, where it really was searched", async () => {
      const w = open({ path: "src/a.ts", text: "needle in the buffer\n" });
      await search(w, "needle");
      expect(w.find('[data-testid="file-search-buffer-skipped"]').exists()).toBe(false);
      w.unmount();
    });

    it("shows the disk answer when nothing is dirty", async () => {
      const w = open(null);
      await search(w, "needle");
      expect(rows(w)).toEqual(["3:const needle = 1;", "9:needle again", "1:another needle"]);
      expect(w.find('[data-testid="file-search-unsaved"]').exists()).toBe(false);
      w.unmount();
    });

    // The buffer's answer is re-derived from the current text, so editing while the panel is open
    // updates the result without another request.
    it("follows the buffer as it changes, without asking again", async () => {
      const w = open({ path: "src/a.ts", text: "needle one\n" });
      await search(w, "needle");
      const asked = vi.mocked(globalThis.fetch).mock.calls.length;
      await w.setProps({ buffer: { path: "src/a.ts", text: "line\nneedle two\n" } });
      await flushPromises();
      expect(rows(w)).toContain("2:needle two");
      expect(vi.mocked(globalThis.fetch).mock.calls).toHaveLength(asked);
      w.unmount();
    });
  });

  describe("what it is NOT showing", () => {
    // Silence here reads as "there is no such text", which is the one wrong answer a search can give.
    it("says so when the result was cut", async () => {
      answering({ matches: DISK, truncated: true, source: "git" });
      const w = open();
      await search(w, "needle");
      expect(w.find('[data-testid="file-search-truncated"]').exists()).toBe(true);
      w.unmount();
    });

    it("says when .gitignore was not applied, rather than letting the reader blame their ignore file", async () => {
      answering({ matches: DISK, truncated: false, source: "no-index" });
      const w = open();
      await search(w, "needle");
      expect(w.find('[data-testid="file-search-unignored"]').exists()).toBe(true);
      w.unmount();
    });

    it("distinguishes 'nothing matches' from 'nothing asked yet'", async () => {
      answering({ matches: [], truncated: false, source: "git" });
      const w = open();
      expect(w.find('[data-testid="file-search-empty"]').exists()).toBe(false);
      await search(w, "needle");
      expect(w.find('[data-testid="file-search-empty"]').exists()).toBe(true);
      w.unmount();
    });

    it("reports a failure instead of showing an empty result", async () => {
      answering({ error: "search failed" }, false, 500);
      const w = open();
      await search(w, "needle");
      expect(w.find('[data-testid="file-search-error"]').text()).toContain("search failed");
      w.unmount();
    });

    // The list is hidden only by being EMPTY, so a failure that left the previous rows in place put
    // the error above a set of rows that were still selectable — and Enter would open a result
    // belonging to a query that had already failed, which reads as the search having worked.
    it("clears the previous query's rows when a search fails", async () => {
      const w = open();
      await search(w, "needle");
      expect(rows(w)).not.toEqual([]); // the premise: there really were rows to lose

      answering({ error: "search failed" }, false, 500);
      await search(w, "needle2");

      expect(w.find('[data-testid="file-search-error"]').exists()).toBe(true);
      expect(rows(w)).toEqual([]);
      // Enter has nothing to open, so it cannot open the wrong thing.
      await w.find('[data-testid="file-search"]').trigger("keydown", { key: "Enter" });
      expect(w.emitted("pick")).toBeUndefined();
      w.unmount();
    });
  });

  describe("the keyboard", () => {
    it("walks the matches and opens the selected one", async () => {
      const w = open();
      await search(w, "needle");
      const panel = w.find('[data-testid="file-search"]');
      await panel.trigger("keydown", { key: "ArrowDown" });
      await panel.trigger("keydown", { key: "Enter" });
      expect(w.emitted("pick")?.[0]).toEqual(["src/a.ts", 9]);
      w.unmount();
    });

    it("closes on Escape", async () => {
      const w = open();
      await w.find('[data-testid="file-search"]').trigger("keydown", { key: "Escape" });
      expect(w.emitted("close")).toHaveLength(1);
      w.unmount();
    });

    // An IME candidate list owns the arrows and Enter while composing; acting on them would open a
    // file in the middle of typing a Japanese query.
    it("leaves the keys alone while an IME is composing", async () => {
      const w = open();
      await search(w, "needle");
      const panel = w.find('[data-testid="file-search"]');
      await panel.trigger("keydown", { key: "Enter", isComposing: true });
      expect(w.emitted("pick")).toBeUndefined();
      w.unmount();
    });
  });

  // What the panel was missing (#2159). A row showed the head of its matching line and nothing
  // else, so a match past the row's width was cut away and the lines that decide whether a result
  // is the one you want were nowhere.
  describe("reading the result", () => {
    it("emphasises what was searched for, rather than leaving the reader to find it", async () => {
      const w = open();
      await search(w, "needle");
      const marked = w.findAll('[data-testid="file-search-row"]')[0]?.findAll(".text-accent");
      expect(marked?.map((span) => span.text())).toEqual(["needle"]);
      w.unmount();
    });

    // THE ROW FROM THE SCREENSHOT: the query is at the END of the line, so drawing the head of the
    // line showed a result with the thing found cut off.
    it("scrolls a line so a match near its end is on screen, and says it did", async () => {
      const w = open();
      answering({
        matches: [{ path: "w.yaml", line: 11, text: "#  (running attacker code with elevated permissions) doesn't apply.", clipped: false }],
        truncated: false,
        source: "git",
      });
      await search(w, "apply");
      const row = w.findAll('[data-testid="file-search-row"]')[0];
      expect(row?.text()).toContain("apply");
      expect(row?.find('[data-testid="file-search-match-line"]').text().startsWith("11…")).toBe(true);
      w.unmount();
    });

    it("says what the list adds up to", async () => {
      const w = open();
      await search(w, "needle");
      expect(w.find('[data-testid="file-search-summary"]').text()).toBe("3 matches in 2 files");
      w.unmount();
    });

    // Two padding-top utilities on one element are BOTH applied, and which wins is decided by the
    // order Tailwind happens to emit them in, not by the expression that put them there. It worked
    // only because `pt-2` is generated after `pt-1.5`; a conditional wanting `pt-1` would silently
    // not apply. Observed during Claude review, not flagged by Codex.
    it("puts exactly one padding-top utility on each heading", async () => {
      const w = open();
      await search(w, "needle");
      const perHeading = w.findAll("li[role='presentation']").map((heading) => paddingTops(heading.classes()).length);
      expect(perHeading.length).toBeGreaterThan(0);
      expect(perHeading.every((count) => count === 1)).toBe(true);
      w.unmount();
    });

    // A column of bare `1`s beside every heading read as decoration rather than as a count.
    it("counts a file's matches only when there is more than one", async () => {
      const w = open();
      await search(w, "needle");
      const headings = w.findAll("li[role='presentation']").map((li) => li.text());
      expect(headings[0]).toContain("2 matches"); // src/a.ts
      expect(headings[1]).not.toMatch(/match/);
      w.unmount();
    });
  });

  describe("the lines around the selected result", () => {
    const WINDOW = { from: 2, lines: [2, 3, 4].map((n) => ({ text: `line ${n}`, clipped: false })) };

    it("opens the selected row onto its surroundings", async () => {
      answeringContext(WINDOW);
      const w = open();
      await search(w, "needle");
      await settleContext();
      const selectedRow = linesOf(w.find('[data-testid="file-search-row"]'));
      expect(selectedRow).toContain("2:line 2");
      expect(selectedRow).toContain("4:line 4");
      w.unmount();
    });

    it("asks for the line the selection is on, under the panel's directory", async () => {
      answeringContext(WINDOW);
      const w = open();
      await search(w, "needle");
      await settleContext();
      expect(lastUrl).toContain("/api/files/browse/lines");
      expect(lastUrl).toContain("path=src%2Fa.ts");
      expect(lastUrl).toContain("line=3");
      expect(lastUrl).toContain("cwd=%2Fproj");
      w.unmount();
    });

    it("opens only the selected row, never the ones around it", async () => {
      answeringContext(WINDOW);
      const w = open();
      await search(w, "needle");
      await settleContext();
      expect(w.findAll('[data-testid="file-search-context-before"]')).toHaveLength(1);
      w.unmount();
    });

    // The block describes ONE line. Leaving it up while the selection moves would show the previous
    // row's surroundings under the new one, which reads as the new row's own.
    it("drops the block the moment the selection moves, rather than leaving a stale one", async () => {
      answeringContext(WINDOW);
      const w = open();
      await search(w, "needle");
      await settleContext();
      expect(w.findAll('[data-testid="file-search-context-before"]')).toHaveLength(1);
      await w.find('[data-testid="file-search"]').trigger("keydown", { key: "ArrowDown" });
      expect(w.findAll('[data-testid="file-search-context-before"]')).toHaveLength(0);
      w.unmount();
    });

    // The one file no on-disk read can answer for. Its surroundings come from the buffer itself, so
    // they are there at once and they are what is on screen rather than what was last saved.
    it("takes the open dirty file's surroundings from the buffer, without asking the server", async () => {
      answeringContext(WINDOW, [{ path: "src/b.ts", line: 1, text: "another needle", clipped: false }]);
      const w = open({ path: "src/a.ts", text: "first\nsecond\nneedle in the buffer\nfourth\nfifth\n" });
      await search(w, "needle");
      const bufferRow = linesOf(w.find('[data-testid="file-search-row"]'));
      expect(bufferRow).toContain("2:second");
      expect(bufferRow).toContain("4:fourth");
      expect(vi.mocked(globalThis.fetch).mock.calls.filter(([input]) => String(input).includes("/browse/lines"))).toHaveLength(0);
      w.unmount();
    });

    // Codex, round 1. The key check stops the PREVIOUS row's lines being drawn under this one, and
    // does nothing about coming BACK: the last answer was still in hand under its own key, so the
    // same row re-served it — a one-entry cache in a composable that claims to read once per
    // settled selection, showing a neighbourhood the file may no longer have.
    it("re-reads a row it returns to, instead of re-serving what it read the first time", async () => {
      let body = { from: 2, lines: [{ text: "FIRST READ", clipped: false }] };
      globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => ({
        ok: true,
        status: 200,
        json: async () => (String(input).includes("/browse/lines") ? body : { matches: DISK, truncated: false, source: "git" }),
      })) as unknown as typeof fetch;
      const w = open();
      await search(w, "needle");
      await settleContext();
      expect(w.find('[data-testid="file-search-context-before"]').text()).toContain("FIRST READ");

      const panel = w.find('[data-testid="file-search"]');
      await panel.trigger("keydown", { key: "ArrowDown" }); // away, without letting its read land
      body = { from: 2, lines: [{ text: "SECOND READ", clipped: false }] };
      await panel.trigger("keydown", { key: "ArrowUp" }); // and back

      // Nothing is shown until the row has been read again.
      expect(w.find('[data-testid="file-search-context-before"]').exists()).toBe(false);
      await settleContext();
      expect(w.find('[data-testid="file-search-context-before"]').text()).toContain("SECOND READ");
      w.unmount();
    });

    // Codex, round 1, and the same mistake at a second site it did not name. A selected row is
    // several lines tall and the rest are one, so the selection moving changes two rows' heights.
    // A default `pre` watcher scrolls against the layout being left rather than the one arrived at.
    it("measures the scroll after the row has changed height, not before", async () => {
      answeringContext(WINDOW);
      const w = open();
      await search(w, "needle");
      blocksWhenScrolled.length = 0;
      await settleContext();
      // The block the scroll exists to accommodate is in the document by the time it is asked for.
      expect(blocksWhenScrolled.length).toBeGreaterThan(0);
      expect(blocksWhenScrolled.every((count) => count === 1)).toBe(true);

      // And the other direction: moving away removes it, so the scroll must see it already gone.
      blocksWhenScrolled.length = 0;
      await w.find('[data-testid="file-search"]').trigger("keydown", { key: "ArrowDown" });
      await flushPromises();
      expect(blocksWhenScrolled.length).toBeGreaterThan(0);
      expect(blocksWhenScrolled.every((count) => count === 0)).toBe(true);
      w.unmount();
    });

    // The block is a visual aid; the thing being CHOSEN is the match line. Inside the option it
    // would otherwise become part of the option's accessible name, so a screen reader announces
    // five lines of code as the name of one result.
    it("keeps the surrounding lines out of the option's accessible name", async () => {
      answeringContext(WINDOW);
      const w = open();
      await search(w, "needle");
      await settleContext();
      expect(w.find('[data-testid="file-search-context-before"]').attributes("aria-hidden")).toBe("true");
      expect(w.find('[data-testid="file-search-context-after"]').attributes("aria-hidden")).toBe("true");
      w.unmount();
    });

    // A peek that could not be read is not an error to report — the result row is unaffected and
    // still opens. Showing a banner over a file the reader only moved the selection onto would be
    // about something they did not ask for.
    it("shows no block and no error when the read comes back unusable", async () => {
      answeringContext({ nothing: "useful" });
      const w = open();
      await search(w, "needle");
      await settleContext();
      expect(w.findAll('[data-testid="file-search-context-before"]')).toHaveLength(0);
      expect(w.find('[data-testid="file-search-error"]').exists()).toBe(false);
      expect(rows(w)).toHaveLength(3);
      w.unmount();
    });
  });
});
