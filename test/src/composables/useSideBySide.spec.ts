import { describe, it, expect, vi, afterEach } from "vitest";
import { computed, defineComponent, h, ref, shallowRef, nextTick } from "vue";
import { mount } from "@vue/test-utils";
import { useSideBySide, type SideBySide } from "../../../src/composables/useSideBySide";
import { fakeCmEditor } from "../../helpers/cmEditorDouble";
import type { CmEditor } from "../../../src/components/cmEditor";
import type { FilePreviewKind } from "../../../src/components/filePreviewKind";

// #2577. Editor and Preview side by side; the Preview follows the heading the editor is under.
const SOURCE = "# One\n\ntext\n\n## Two\n\nmore\n\n## One\n\nend\n";

function setup(opts: { kind?: FilePreviewKind | null; preview?: boolean; top?: number } = {}) {
  const editor = fakeCmEditor(SOURCE, null, opts.top ?? 1);
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
  const preview = {
    goToHeading: goToPreviewHeading,
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
  return { side, editor, goToPreviewHeading, togglePreview, showPreview, scroll, ready, wrapper };
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

  // A reloaded Preview (another file, a save) answers with the place it remembered; the heading the
  // editor is under goes after it, even when it is the one sent last.
  it("sends the heading again when the Preview document reloads", async () => {
    const { side, goToPreviewHeading, ready } = setup({ top: 6 });
    await side.toggle();
    await nextTick();
    goToPreviewHeading.mockClear();
    ready();
    await nextTick();
    expect(goToPreviewHeading).toHaveBeenCalledWith(1, "Two", 0);
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
