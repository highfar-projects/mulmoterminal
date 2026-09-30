import { describe, it, expect, vi, afterEach } from "vitest";
import { defineComponent, h, ref } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import { useMdPreviewScroll, type MdPreviewScroll } from "../../../src/composables/useMdPreviewScroll";
import { MD_PREVIEW_FROM_FRAME } from "../../../common/mdPreviewMessage";
import { previewCodeBlocks } from "../../../common/previewCodeBlocks";

// #2615. A copy button in the Preview names a block by number; the pane reads that block from the file
// and shows it. What reaches the dialog must be the FILE's text, the latest press, for the file open.

const TOKEN = "0123456789abcdef-wire";
const FILE = "# Doc\n\n```ts\nconst first = 1;\n```\n\n```sh\necho second\n```\n";

function mountHost(openPath = ref<string | null>("a.md")) {
  const frame = document.createElement("iframe");
  document.body.append(frame);
  let api: MdPreviewScroll | null = null;
  mount(
    defineComponent({
      setup() {
        api = useMdPreviewScroll(
          () => frame,
          ref(0),
          () => {},
          () => TOKEN,
          { cwd: () => "/proj", openPath: () => openPath.value, label: () => "Copy this code block" },
        );
        return () => h("div");
      },
    }),
  );
  const press = (index: unknown): void => {
    const event = new MessageEvent("message", { data: { source: MD_PREVIEW_FROM_FRAME, kind: "code-block", index, token: TOKEN } });
    Object.defineProperty(event, "source", { value: frame.contentWindow });
    window.dispatchEvent(event);
  };
  return { frame, press, shown: () => api?.codeBlock?.shown.value ?? null, openPath };
}

/** The server's `/code-block` route over one file: the block at `?index=`, or its 404 for none. */
const serveFile = (text: string | null) =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (text === null) return new Response("{}", { status: 500 });
      const block = previewCodeBlocks(text)[Number(new URL(url, "https://localhost").searchParams.get("index"))];
      return block ? new Response(JSON.stringify(block), { status: 200 }) : new Response(JSON.stringify({ kind: "no-block" }), { status: 404 });
    }),
  );

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("a Preview code block's copy button", () => {
  it("shows the block the button names, read from the file", async () => {
    serveFile(FILE);
    const host = mountHost();
    host.press(1);
    await flushPromises();
    expect(host.shown()).toEqual({ status: "found", block: { lang: "sh", text: "echo second" } });
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toContain("/api/files/browse/code-block?");
  });

  it("says the block is gone when the file no longer has it", async () => {
    serveFile("no code now\n");
    const host = mountHost();
    host.press(0);
    await flushPromises();
    expect(host.shown()).toEqual({ status: "missing" });
  });

  it("says it could not read the file when the read fails", async () => {
    serveFile(null);
    const host = mountHost();
    host.press(0);
    await flushPromises();
    expect(host.shown()).toEqual({ status: "failed" });
  });

  it("drops the answer when another file was opened meanwhile", async () => {
    serveFile(FILE);
    const host = mountHost();
    host.press(0);
    host.openPath.value = "b.md";
    await flushPromises();
    expect(host.shown()).toBeNull();
  });

  it.each([[-1], ["0"], [1.5]])("ignores a press naming %j", async (index) => {
    serveFile(FILE);
    const host = mountHost();
    host.press(index);
    await flushPromises();
    expect(fetch).not.toHaveBeenCalled();
    expect(host.shown()).toBeNull();
  });

  it("names the buttons when it answers a fresh document", () => {
    serveFile(FILE);
    const host = mountHost();
    const target = host.frame.contentWindow;
    if (!target) throw new Error("the frame has no window");
    const sent = vi.spyOn(target, "postMessage");
    const event = new MessageEvent("message", { data: { source: MD_PREVIEW_FROM_FRAME, kind: "ready", token: TOKEN } });
    Object.defineProperty(event, "source", { value: host.frame.contentWindow });
    window.dispatchEvent(event);
    expect(sent).toHaveBeenCalledWith(expect.objectContaining({ codeCopyLabel: "Copy this code block" }), "*");
  });
});
