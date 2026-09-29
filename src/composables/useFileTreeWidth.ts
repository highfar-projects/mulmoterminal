import { ref, type Ref } from "vue";
import { dragSplitter } from "./dragSplitter";
import { clampSecondary, splitterKeySize, FILE_EDITOR_TREE, MIN_FILE_EDITOR, MIN_FILE_TREE } from "../components/splitterWidth";
import { readStored, writeStored } from "../utils/localStore";

const TREE_WIDTH_KEY = "files_tree_width";
const TREE_WIDTH_DEFAULT_PX = 240;
const SEPARATOR_PX = 5;

/** The file pane's tree | editor separator. The tree is BEFORE it, so dragging right grows it.
 *  `tree` is the tree element; the row it sits in is the space the two sides divide. */
export function useFileTreeWidth(tree: Readonly<Ref<HTMLElement | null>>) {
  const treeWidth = ref(Number(readStored(TREE_WIDTH_KEY)) || TREE_WIDTH_DEFAULT_PX);
  const available = (): number => Math.max(0, (tree.value?.parentElement?.clientWidth ?? 0) - SEPARATOR_PX);

  function setTreeWidth(width: number): void {
    const space = available();
    if (space > 0) treeWidth.value = clampSecondary(width, space, FILE_EDITOR_TREE);
  }

  // Start from the width ON SCREEN, not the stored one: a window narrower than when it was stored
  // caps the tree with max-width, and a drag from the stored number would not move until it caught up.
  const onSplitterDown = dragSplitter({
    axis: (e) => e.clientX,
    size: () => tree.value?.getBoundingClientRect().width ?? treeWidth.value,
    resize: (start, travel) => setTreeWidth(start + travel),
    key: TREE_WIDTH_KEY,
    remember: writeStored,
  });

  // The keys speak the editor's size (the primary), which lies AFTER the separator.
  function onSplitterKey(e: KeyboardEvent): void {
    const space = available();
    const next = splitterKeySize(e.key, space - treeWidth.value, space, FILE_EDITOR_TREE, "horizontal", "after");
    if (next === null) return;
    e.preventDefault();
    setTreeWidth(space - next);
    writeStored(TREE_WIDTH_KEY, String(treeWidth.value));
  }

  const treeStyle = (): Record<string, string> => ({
    flexBasis: `${treeWidth.value}px`,
    maxWidth: `calc(100% - ${MIN_FILE_EDITOR + SEPARATOR_PX}px)`,
  });

  return { treeWidth, treeMin: MIN_FILE_TREE, treeStyle, onSplitterDown, onSplitterKey };
}
