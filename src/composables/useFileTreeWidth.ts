import { computed, onBeforeUnmount, onMounted, ref, type Ref } from "vue";
import { dragSplitter } from "./dragSplitter";
import { MIN_FILE_EDITOR, MIN_FILE_TREE } from "../components/splitterWidth";
import { clampTreeWidth, storedTreeWidth, treeWidthForKey } from "../components/fileTreeWidth";
import { readStored, writeStored } from "../utils/localStore";

const TREE_WIDTH_KEY = "files_tree_width";
const SEPARATOR_PX = 5;

/** The file pane's tree | editor separator. The tree is BEFORE it, so dragging right grows it.
 *  `tree` is the tree element; the row it sits in is the space the two sides divide. */
export function useFileTreeWidth(tree: Readonly<Ref<HTMLElement | null>>) {
  const treeWidth = ref(storedTreeWidth(readStored(TREE_WIDTH_KEY)));
  const available = ref(0);
  const measure = (): void => {
    available.value = Math.max(0, (tree.value?.parentElement?.clientWidth ?? 0) - SEPARATOR_PX);
  };
  // What is on screen: a width stored in a wider window is kept, but shown (and announced, and moved
  // by a key) as what fits now. Before the row is laid out there is nothing to clamp against.
  const shownWidth = computed(() => (available.value > 0 ? clampTreeWidth(treeWidth.value, available.value) : treeWidth.value));
  const maxWidth = computed(() => (available.value > 0 ? clampTreeWidth(available.value, available.value) : undefined));

  let rowObserver: ResizeObserver | null = null;
  onMounted(() => {
    measure();
    const row = tree.value?.parentElement;
    if (!row || typeof ResizeObserver === "undefined") return;
    rowObserver = new ResizeObserver(measure);
    rowObserver.observe(row);
  });
  onBeforeUnmount(() => rowObserver?.disconnect());

  function setTreeWidth(width: number): void {
    measure();
    if (available.value > 0) treeWidth.value = clampTreeWidth(width, available.value);
  }

  const onSplitterDown = dragSplitter({
    axis: (e) => e.clientX,
    size: () => shownWidth.value,
    resize: (start, travel) => setTreeWidth(start + travel),
    key: TREE_WIDTH_KEY,
    remember: writeStored,
  });

  function onSplitterKey(e: KeyboardEvent): void {
    measure();
    const next = available.value > 0 ? treeWidthForKey(e.key, shownWidth.value, available.value) : null;
    if (next === null) return;
    e.preventDefault();
    treeWidth.value = next;
    writeStored(TREE_WIDTH_KEY, String(next));
  }

  const treeStyle = (): Record<string, string> => ({
    flexBasis: `${shownWidth.value}px`,
    maxWidth: `calc(100% - ${MIN_FILE_EDITOR + SEPARATOR_PX}px)`,
  });

  return { shownWidth, treeMin: MIN_FILE_TREE, maxWidth, treeStyle, onSplitterDown, onSplitterKey };
}
