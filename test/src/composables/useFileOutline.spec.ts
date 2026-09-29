import { describe, it, expect, vi } from "vitest";
import { ref, shallowRef } from "vue";
import { useFileOutline } from "../../../src/composables/useFileOutline";
import { fakeCmEditor } from "../../helpers/cmEditorDouble";
import type { CmEditor } from "../../../src/components/cmEditor";

// #2576. The outline goes to the line in the editor, and to the heading in the Preview.
const SOURCE = "# One\n\ntext\n\n## Two\n\nmore\n\n## Three\n";

function setup(showPreview = false) {
  const editor = fakeCmEditor(SOURCE, null, 6);
  const goToPreviewHeading = vi.fn();
  const outline = useFileOutline({ editor: shallowRef<CmEditor | null>(editor), showPreview: ref(showPreview), goToPreviewHeading });
  outline.refresh();
  return { editor, goToPreviewHeading, outline };
}

describe("useFileOutline", () => {
  it("reads the buffer's headings and marks the one the reader is under", () => {
    const { outline } = setup();
    expect(outline.headings.value.map((h) => h.text)).toEqual(["One", "Two", "Three"]);
    expect(outline.current.value).toBe(1); // line 6 is under "Two" (line 5)
  });

  // At the top, so the mark read back from the top line is the heading just picked.
  it("puts the heading's line at the top of the editor, and marks it next time", () => {
    const { editor, goToPreviewHeading, outline } = setup();
    outline.pick(2);
    expect(editor.goTo).toHaveBeenLastCalledWith({ line: 9, col: 0 });
    expect(editor.scrollLineToTop).toHaveBeenLastCalledWith(9);
    expect(editor.focus).toHaveBeenCalled();
    expect(goToPreviewHeading).not.toHaveBeenCalled();
    outline.refresh();
    expect(outline.current.value).toBe(2);
  });

  it("asks the Preview for the heading by position and text, and marks none there", () => {
    const { editor, goToPreviewHeading, outline } = setup(true);
    expect(outline.current.value).toBeNull();
    outline.pick(1);
    expect(goToPreviewHeading).toHaveBeenCalledWith(1, "Two", 0);
    expect(editor.goTo).not.toHaveBeenCalled();
  });

  // The second heading of a repeated text says so, for when the Preview's count and the outline's differ.
  it("says which of the headings with that text a Preview pick is", () => {
    const editor = fakeCmEditor("## Usage\n\n## API\n\n## Usage\n", null, 1);
    const goToPreviewHeading = vi.fn();
    const outline = useFileOutline({ editor: shallowRef<CmEditor | null>(editor), showPreview: ref(true), goToPreviewHeading });
    outline.refresh();
    outline.pick(2);
    expect(goToPreviewHeading).toHaveBeenCalledWith(2, "Usage", 1);
  });

  it("ignores a pick past the end", () => {
    const { editor, goToPreviewHeading, outline } = setup();
    outline.pick(9);
    expect(editor.goTo).not.toHaveBeenCalled();
    expect(goToPreviewHeading).not.toHaveBeenCalled();
  });
});
