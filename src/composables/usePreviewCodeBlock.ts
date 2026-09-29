// The Preview's code-block button (#2615): a press names a block's number, and the block is read
// from the file for the dialog. Only the latest press is shown, and only while that file is open.
import { ref, type Ref } from "vue";
import { previewCodeBlockAt, type CodeBlockLookup } from "../components/previewCodeBlockApi";
/** The Preview's code-block buttons: what a press opens, and what the buttons are called. */
export interface PreviewCodeBlockHost {
  open: (index: number) => void;
  label: () => string;
}

export interface PreviewCodeBlockDeps {
  cwd: () => string | null;
  openPath: () => string | null;
  label: () => string;
}

export interface PreviewCodeBlock {
  host: PreviewCodeBlockHost;
  shown: Ref<CodeBlockLookup | null>;
  close: () => void;
}

export function usePreviewCodeBlock(deps: PreviewCodeBlockDeps): PreviewCodeBlock {
  const shown = ref<CodeBlockLookup | null>(null);
  let latest = 0;
  const open = async (index: number): Promise<void> => {
    const path = deps.openPath();
    if (!path) return;
    const request = ++latest;
    const lookup = await previewCodeBlockAt(deps.cwd(), path, index);
    if (request === latest && deps.openPath() === path) shown.value = lookup;
  };
  return { host: { open: (index) => void open(index), label: deps.label }, shown, close: () => (shown.value = null) };
}
