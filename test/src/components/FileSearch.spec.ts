import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import FileSearch from "../../../src/components/FileSearch.vue";

// The "search in files" panel (#2140). What a search MEANS is common/fileSearch.ts and is tested
// there; this file is about the PANEL — that it asks the right question, that it shows the one file
// the server cannot answer for, and that it says out loud when what it is showing is not everything.

const DISK = [
  { path: "src/a.ts", line: 3, text: "const needle = 1;", clipped: false },
  { path: "src/a.ts", line: 9, text: "needle again", clipped: false },
  { path: "src/b.ts", line: 1, text: "another needle", clipped: false },
];

let lastUrl = "";

const answering = (body: unknown, ok = true, status = 200) => {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    lastUrl = String(input);
    return { ok, status, json: async () => body };
  }) as unknown as typeof fetch;
};

// jsdom implements no scrolling, so the real method is absent rather than inert.
type Scrollable = { scrollIntoView?: (arg?: unknown) => void };

const realFetch = globalThis.fetch;
beforeEach(() => {
  vi.useFakeTimers();
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
