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

  it.each<["missing" | "failed", string]>([
    ["missing", "no longer in the file"],
    ["failed", "Could not read the file"],
  ])("says why there is nothing to copy (%s)", async (status, words) => {
    dialogFor({ status });
    await flushPromises();
    expect(inBody("preview-code-block")?.textContent).toContain(words);
    expect(inBody("preview-code-block-copy")).toBeNull();
  });

  it("closes on Escape", async () => {
    const w = dialogFor({ status: "found", block: BLOCK });
    await flushPromises();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(w.emitted("close")).toHaveLength(1);
  });
});
