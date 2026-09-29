import { describe, it, expect, vi, afterEach } from "vitest";
import { computed, defineComponent, h, ref, shallowRef, nextTick } from "vue";
import { mount } from "@vue/test-utils";
import { useSideBySide, type SideBySide } from "../../../src/composables/useSideBySide";
import { fakeCmEditor } from "../../helpers/cmEditorDouble";
import type { CmEditor } from "../../../src/components/cmEditor";
import type { FilePreviewKind } from "../../../src/components/filePreviewKind";

// #2577. Editor and Preview side by side; the Preview follows the heading the editor is under.
const SOURCE = "# One\n\ntext\n\n## Two\n\nmore\n\n## One\n\nend\n";

function setup(opts: { kind?: FilePreviewKind | null; preview?: boolean; top?: number; source?: string } = {}) {
  const editor = fakeCmEditor(opts.source ?? SOURCE, null, opts.top ?? 1);
  const showPreview = ref(opts.preview ?? false);
  const kind = ref<FilePreviewKind | null>(opts.kind === undefined ? "markdown" : opts.kind);
  const togglePreview = vi.fn(async () => {
    showPreview.value = !showPreview.value;
  });
  const file = {
    openPath: ref<string | null>("a.md"),
    previewKind: computed(() => kind.value),
    unpreviewable: ref<string | null>(null),
    showPreview,
    editor: shallowRef<CmEditor | null>(editor),
    togglePreview,
  };
  const goToPreviewHeading = vi.fn();
  const readyListeners: (() => void)[] = [];
  const goToTop = vi.fn();
  const preview = {
    goToHeading: goToPreviewHeading,
    goToTop,
    onReady: (listener: () => void) => {
      readyListeners.push(listener);
    },
  };
  const ready = () => readyListeners.forEach((listener) => listener());
  const holder: { side: SideBySide | null; host: HTMLDivElement | null } = { side: null, host: null };
  const wrapper = mount(
    defineComponent({
      setup() {
        const editorHost = ref<HTMLElement>();
        holder.side = useSideBySide({ file, editorHost, preview });
        return () => h("div", { ref: editorHost }, [h("div", { class: "scroller" })]);
      },
    }),
    { attachTo: document.body },
  );
  const side = holder.side;
  if (!side) throw new Error("not mounted");
  const scroll = () => wrapper.get(".scroller").element.dispatchEvent(new Event("scroll"));
  return { side, editor, goToPreviewHeading, goToTop, togglePreview, showPreview, scroll, ready, file, wrapper };
}

afterEach(() => vi.useRealTimers());

describe("useSideBySide", () => {
  it("takes the Preview to the editor's heading as soon as it is switched on", async () => {
    const { side, goToPreviewHeading } = setup({ top: 6 });
    await side.toggle();
    await nextTick();
    expect(side.active.value).toBe(true);
    expect(goToPreviewHeading).toHaveBeenCalledWith(1, "Two", 0);
  });

  // The second "One" is the second heading with that text, so the Preview does not stop at the first.
  it("follows the editor's scrolling, heading by heading, once it settles", async () => {
    vi.useFakeTimers();
    const { side, editor, goToPreviewHeading, scroll } = setup({ top: 1 });
    await side.toggle();
    await nextTick();
    goToPreviewHeading.mockClear();
    editor.scrollLineToTop(10);
    scroll();
    scroll();
    expect(goToPreviewHeading).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(goToPreviewHeading).toHaveBeenCalledTimes(1);
    expect(goToPreviewHeading).toHaveBeenCalledWith(2, "One", 1);
  });

  it("does not send the same heading again for a scroll within its section", async () => {
    vi.useFakeTimers();
    const { side, editor, goToPreviewHeading, scroll } = setup({ top: 5 });
    await side.toggle();
    await nextTick();
    goToPreviewHeading.mockClear();
    editor.scrollLineToTop(7);
    scroll();
    vi.runAllTimers();
    expect(goToPreviewHeading).not.toHaveBeenCalled();
  });

  it("leaves the Preview for the editor when switched on from it", async () => {
    const { side, togglePreview, showPreview } = setup({ preview: true });
    await side.toggle();
    expect(togglePreview).toHaveBeenCalledTimes(1);
    expect(showPreview.value).toBe(false);
    expect(side.active.value).toBe(true);
  });

  // The Preview chosen alone keeps the switch on; the button shows it off, so one press must bring
  // both halves back — and send the heading, since the Preview was wherever the reader left it.
  it("comes back side by side in one press after the Preview was shown alone", async () => {
    const { side, togglePreview, showPreview, goToPreviewHeading } = setup({ top: 6 });
    await side.toggle();
    await togglePreview();
    expect(side.active.value).toBe(false);
    goToPreviewHeading.mockClear();
    await side.toggle();
    await nextTick();
    expect(showPreview.value).toBe(false);
    expect(side.active.value).toBe(true);
    expect(goToPreviewHeading).toHaveBeenCalledWith(1, "Two", 0);
  });

  // Another file in the Preview answers with the place it remembered for that file; the heading the
  // editor is under goes after it.
  it("sends the heading again when the Preview loads another file", async () => {
    const { side, goToPreviewHeading, ready, file } = setup({ top: 6 });
    await side.toggle();
    await nextTick();
    goToPreviewHeading.mockClear();
    file.openPath.value = "b.md";
    ready();
    await nextTick();
    expect(goToPreviewHeading).toHaveBeenCalledWith(1, "Two", 0);
  });

  // The editor lands in the new file and scrolls before the new document is up, so the heading sent
  // then goes to a document that is leaving; the new one's `ready` must bring it again.
  it("sends the heading again when the new file's document is ready, even after one was sent on the way", async () => {
    vi.useFakeTimers();
    const { side, editor, goToPreviewHeading, ready, file, scroll } = setup({ top: 6 });
    await side.toggle();
    await nextTick();
    ready();
    file.openPath.value = "b.md";
    editor.scrollLineToTop(10);
    scroll();
    vi.runAllTimers();
    goToPreviewHeading.mockClear();
    ready();
    await nextTick();
    expect(goToPreviewHeading).toHaveBeenCalledWith(2, "One", 1);
  });

  // Back to the same file through one that is not Markdown: its Preview is a new document, which the
  // heading sent on the way back may have missed.
  it("sends the heading again when the same file comes back through another", async () => {
    const { side, goToPreviewHeading, ready, file } = setup({ top: 6 });
    await side.toggle();
    await nextTick();
    ready();
    file.openPath.value = "c.ts";
    await nextTick();
    file.openPath.value = "a.md";
    await nextTick();
    goToPreviewHeading.mockClear();
    ready();
    await nextTick();
    expect(goToPreviewHeading).toHaveBeenCalledWith(1, "Two", 0);
  });

  // A save reloads the same file; the host puts back the place the reader had scrolled the Preview to,
  // and pulling it to the top of the section would take the lines just edited off screen.
  it("keeps the Preview's place when the same file reloads", async () => {
    const { side, goToPreviewHeading, ready } = setup({ top: 6 });
    await side.toggle();
    await nextTick();
    ready();
    await nextTick();
    goToPreviewHeading.mockClear();
    ready();
    await nextTick();
    expect(goToPreviewHeading).not.toHaveBeenCalled();
  });

  // Front matter or an intro before the first heading: the Preview goes to its top, not stays put.
  it("takes the Preview to its top above the first heading", async () => {
    vi.useFakeTimers();
    const { side, editor, goToPreviewHeading, goToTop, scroll } = setup({ source: "---\ntitle: x\n---\n\nintro\n\n# One\n\ntext\n", top: 8 });
    await side.toggle();
    await nextTick();
    expect(goToPreviewHeading).toHaveBeenCalledWith(0, "One", 0);
    editor.scrollLineToTop(1);
    scroll();
    vi.runAllTimers();
    expect(goToTop).toHaveBeenCalledTimes(1);
    scroll();
    vi.runAllTimers();
    expect(goToTop).toHaveBeenCalledTimes(1);
  });

  it("sends nothing on a reload while not side by side", async () => {
    const { goToPreviewHeading, ready } = setup({ top: 6 });
    ready();
    await nextTick();
    expect(goToPreviewHeading).not.toHaveBeenCalled();
  });

  it("is off for a file that is not Markdown, and follows nothing", async () => {
    vi.useFakeTimers();
    const { side, goToPreviewHeading, scroll } = setup({ kind: "html" });
    await side.toggle();
    expect(side.active.value).toBe(false);
    scroll();
    vi.runAllTimers();
    expect(goToPreviewHeading).not.toHaveBeenCalled();
  });

  it("puts the editor first, in equal halves, only while on", async () => {
    const { side } = setup();
    expect(side.editorClass.value).not.toContain("order-first");
    expect(side.previewClass.value).toBe("");
    await side.toggle();
    await nextTick();
    expect(side.editorClass.value).toContain("files-editor");
    expect(side.editorClass.value).toContain("order-first basis-0");
    expect(side.previewClass.value).toContain("min-w-0 basis-0");
    await side.toggle();
    expect(side.active.value).toBe(false);
  });
});
