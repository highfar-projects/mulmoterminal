import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { fakeCmEditor } from "../../helpers/cmEditorDouble";
import FilesPane from "../../../src/components/FilesPane.vue";

// #3058. The pane's copy button takes the editor's own document, so what lands on the clipboard is the
// text as it is (unsaved edits included) rather than what a drag selection across the gutter makes.
const DOC = "line one\nline two\n";
const fakeEditor = fakeCmEditor(DOC);
vi.mock("../../../src/composables/usePubSub", () => ({
  usePubSub: () => ({ subscribe: () => () => {}, onReconnect: () => () => {} }),
}));
vi.mock("../../../src/components/cmEditor", async (orig) => {
  const actual = await orig<typeof import("../../../src/components/cmEditor")>();
  return { ...actual, createEditor: () => fakeEditor };
});

const writeText = vi.fn<(text: string) => Promise<void>>(async () => {});

function serve(): void {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), "https://x");
    if (url.pathname.includes("/list")) return { ok: true, json: async () => ({ entries: [{ name: "b.ts", dir: false, size: 1 }] }) };
    if (url.pathname.includes("/text")) return { ok: true, json: async () => ({ text: DOC, version: "v1" }) };
    return { ok: true, json: async () => ({ ok: true }) };
  }) as unknown as typeof fetch;
}

const setClipboard = (clipboard: unknown): void => {
  Object.defineProperty(navigator, "clipboard", { value: clipboard, configurable: true });
};

const mountOn = async (path = "b.ts") => {
  const w = mount(FilesPane, {
    props: { cwd: "/proj", initialState: { tabs: [{ path }], activePath: path, expanded: [] } },
    attachTo: document.body,
  });
  await flushPromises();
  return w;
};

const notice = () => document.querySelector('[data-testid="preview-code-copied"]');

describe("the Files pane's copy button (#3058)", () => {
  beforeEach(() => {
    localStorage.clear();
    writeText.mockReset();
    writeText.mockResolvedValue(undefined);
    setClipboard({ writeText });
    serve();
  });
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("copies the editor's whole document and says so", async () => {
    const w = await mountOn();
    await w.get('[data-testid="files-copy-text"]').trigger("click");
    await flushPromises();
    expect(writeText).toHaveBeenCalledWith(fakeEditor.getDoc());
    expect(notice()?.textContent).toContain("line one");
  });

  it("says nothing was copied when the browser refuses the write", async () => {
    writeText.mockRejectedValueOnce(new Error("denied"));
    const w = await mountOn();
    await w.get('[data-testid="files-copy-text"]').trigger("click");
    await flushPromises();
    expect(notice()).toBeNull();
  });

  // Plain http on a LAN address has no Clipboard API, and a button that cannot copy is not offered.
  it("offers no button where the page has no clipboard", async () => {
    setClipboard(undefined);
    const w = await mountOn();
    expect(w.find('[data-testid="files-copy-text"]').exists()).toBe(false);
  });
});
