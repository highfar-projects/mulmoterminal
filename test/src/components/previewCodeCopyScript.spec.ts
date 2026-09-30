import { describe, it, expect } from "vitest";
import { JSDOM } from "jsdom";
import { mdPreviewReporterTag } from "../../../server/files/mdPreviewReporter";
import { MD_PREVIEW_FROM_FRAME, MD_PREVIEW_FROM_HOST } from "../../../common/mdPreviewMessage";

// #2615. The reporter's copy buttons, run for real in a document of their own (a JSDOM that runs
// scripts, as the Preview does): what a press posts, and that a document which shadows the DOM
// methods or wraps a block in a link cannot stop the rest of the script.

const TOKEN = "0123456789abcdef-wire";

class InertResizeObserver {
  observe(): void {}
}

/** The Preview document over `body`, with its reporter run; what it posts is collected. `shadow`
 *  names `document` methods to replace with an element, as `<img name="…">` does in a browser. */
function previewOf(body: string, shadow: string[] = []) {
  const posted: unknown[] = [];
  const dom = new JSDOM(`<!doctype html><body>${body}${mdPreviewReporterTag("nonce", TOKEN)}</body>`, {
    runScripts: "dangerously",
    beforeParse(window) {
      Object.defineProperty(window, "ResizeObserver", { value: InertResizeObserver });
      Object.defineProperty(window, "postMessage", { value: (message: unknown) => posted.push(message) });
      Object.defineProperty(window, "scrollTo", { value: () => {} });
      shadow.forEach((name) => Object.defineProperty(window.document, name, { value: window.document.createElement("img") }));
    },
  });
  const { window } = dom;
  const buttons = () => [...window.document.body.children].flatMap((element) => [...element.getElementsByTagName("button")]);
  const kinds = () => posted.map((message) => (message && typeof message === "object" && "kind" in message ? message.kind : null));
  return { window, posted, buttons, kinds };
}

describe("the Preview's code-block buttons", () => {
  it("post the number of the block they sit on", () => {
    const preview = previewOf('<pre data-code-block="0"><code>a</code></pre><pre data-code-block="1"><code>b</code></pre>');
    expect(preview.buttons()).toHaveLength(2);
    preview.buttons()[1]?.click();
    expect(preview.posted.at(-1)).toMatchObject({ source: MD_PREVIEW_FROM_FRAME, kind: "code-block", index: 1, token: TOKEN });
  });

  it("are the press, not the link a block sits in", () => {
    const preview = previewOf('<a href="https://example.com/"><pre data-code-block="0"><code>a</code></pre></a>');
    preview.buttons()[0]?.click();
    expect(preview.kinds()).toEqual(["ready", "code-block"]);
  });

  it("still appear, and the script still announces itself, when the document shadows the DOM methods", () => {
    const preview = previewOf('<pre data-code-block="0"><code>a</code></pre>', ["querySelectorAll", "createElement"]);
    expect(preview.kinds()).toContain("ready");
    expect(preview.buttons()).toHaveLength(1);
  });

  // The app's language changed while the document was open: a message with only the name renames them.
  it("take a new name when the host sends one on its own", () => {
    const preview = previewOf('<pre data-code-block="0"><code>a</code></pre>');
    const rename = (codeCopyLabel: string) =>
      preview.window.dispatchEvent(
        new preview.window.MessageEvent("message", { data: { source: MD_PREVIEW_FROM_HOST, codeCopyLabel }, source: preview.window }),
      );
    rename("このコードブロックをコピー");
    expect(preview.buttons()[0]?.getAttribute("aria-label")).toBe("このコードブロックをコピー");
    expect(preview.buttons()[0]?.getAttribute("title")).toBe("このコードブロックをコピー");
  });

  it("take their name from the host's answer", () => {
    const preview = previewOf('<pre data-code-block="0"><code>a</code></pre>');
    const data = { source: MD_PREVIEW_FROM_HOST, scrollY: 0, codeCopyLabel: "Copy this code block" };
    preview.window.dispatchEvent(new preview.window.MessageEvent("message", { data, source: preview.window }));
    expect(preview.buttons()[0]?.getAttribute("aria-label")).toBe("Copy this code block");
  });
});
