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

const realFetch = globalThis.fetch;
beforeEach(() => {
  vi.useFakeTimers();
  signals.length = 0;
  answering({ matches: DISK, truncated: false, source: "git" });
  (Element.prototype as Scrollable).scrollIntoView = vi.fn();
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
 *  which carries no separator and would make an assertion read like a typo. */
const rows = (w: ReturnType<typeof open>) =>
  w.findAll('[data-testid="file-search-row"]').map((row) => {
    const [line, text] = row.findAll("span");
    return `${line?.text() ?? ""}:${text?.text() ?? ""}`;
  });

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

    const before = vi.mocked(globalThis.fetch).mock.calls.length;
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
    expect(vi.mocked(globalThis.fetch).mock.calls).toHaveLength(before);
    expect(rows(w)).toEqual([]);
    w.unmount();
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
    const before = vi.mocked(globalThis.fetch).mock.calls.length;
    await w.find('[data-testid="file-search-case"]').trigger("click");
    await vi.runOnlyPendingTimersAsync();
    await flushPromises();
    expect(vi.mocked(globalThis.fetch).mock.calls).toHaveLength(before + 1);
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
});
