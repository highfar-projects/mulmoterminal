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
  const holder: { side: SideBySide | null; host: HTMLDivElement | null } = { side: null, host: null };
  const wrapper = mount(
    defineComponent({
      setup() {
        const editorHost = ref<HTMLElement>();
        holder.side = useSideBySide({ file, editorHost, goToPreviewHeading });
        return () => h("div", { ref: editorHost }, [h("div", { class: "scroller" })]);
      },
    }),
    { attachTo: document.body },
  );
  const side = holder.side;
  if (!side) throw new Error("not mounted");
  const scroll = () => wrapper.get(".scroller").element.dispatchEvent(new Event("scroll"));
  return { side, editor, goToPreviewHeading, togglePreview, showPreview, scroll, wrapper };
}

afterEach(() => vi.useRealTimers());

describe("useSideBySide", () => {
  it("takes the Preview to the editor's heading as soon as it is switched on", async () => {
    const { side, goToPreviewHeading } = setup({ top: 6 });
    await side.toggle();
    expect(side.active.value).toBe(true);
    expect(goToPreviewHeading).toHaveBeenCalledWith(1, "Two", 0);
  });

  // The second "One" is the second heading with that text, so the Preview does not stop at the first.
  it("follows the editor's scrolling, heading by heading, once it settles", async () => {
    vi.useFakeTimers();
    const { side, editor, goToPreviewHeading, scroll } = setup({ top: 1 });
    await side.toggle();
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
    expect(side.previewClass.value).toContain("basis-0");
    await side.toggle();
    expect(side.active.value).toBe(false);
  });
});
