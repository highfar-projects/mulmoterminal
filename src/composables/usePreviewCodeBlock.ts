// The Preview's code-block button (#2615, #3003): a press names a block's number, and the block is read
// from the file. It is copied at once with a short notice; the dialog opens only when it cannot be —
// hidden characters, no Clipboard API, a refused write, or a block that is gone. Only the latest press
// counts, and only while that file is open.
import { onScopeDispose, ref, watch, type Ref } from "vue";
import { useCopiedNotice } from "./useCopiedNotice";
import { previewCodeBlockAt, type CodeBlockLookup } from "../components/previewCodeBlockApi";
import { copiedNoticeFor, directCopyText, writeClipboardLater, type CopiedNotice } from "../components/previewCodeCopy";
import { clipboardAvailable } from "../components/codeBlockCopy";
/** The Preview's code-block buttons: what a press opens, what the buttons are called, and what the
 *  disclosure that keeps a diagram's block reachable is called (#2991). */
export interface PreviewCodeBlockHost {
  open: (index: number) => void;
  label: () => string;
  diagramSourceLabel: () => string;
}

export interface PreviewCodeBlockDeps {
  cwd: () => string | null;
  openPath: () => string | null;
  label: () => string;
  diagramSourceLabel: () => string;
}

/** What the Files pane holds for the code-block dialog and notice — not a block itself (see common/previewCodeBlocks.ts). */
export interface PreviewCodeBlockDialogState {
  host: PreviewCodeBlockHost;
  shown: Ref<CodeBlockLookup | null>;
  copied: Ref<CopiedNotice | null>;
  close: () => void;
}

export function usePreviewCodeBlock(deps: PreviewCodeBlockDeps): PreviewCodeBlockDialogState {
  const shown = ref<CodeBlockLookup | null>(null);
  const { copied, show: showCopied, clear: clearCopied } = useCopiedNotice();
  let latest = 0;
  const open = async (index: number): Promise<void> => {
    const path = deps.openPath();
    if (!path) return;
    const request = ++latest;
    clearCopied();
    const lookup = previewCodeBlockAt(deps.cwd(), path, index);
    // Started before the read finishes, so the write still counts as the press's (see writeClipboardLater).
    // The text is withheld from a press that a newer press, or another file, has superseded by the time its
    // read answers: the browser does not order two pending writes. Once handed over, the write commits almost
    // at once and an overlapping newer write still wins (measured in Chromium); queuing writes instead would
    // lose Safari's press activation.
    const current = lookup.then((answer) => (request === latest ? directCopyText(answer) : null));
    const written = clipboardAvailable() ? writeClipboardLater(current) : Promise.resolve(false);
    const [answer, copiedNow] = await Promise.all([lookup, written]);
    if (request !== latest) return;
    if (copiedNow && answer.status === "found") showCopied(copiedNoticeFor(answer.block.text));
    else shown.value = answer;
  };
  // Every way a press stops being current goes through here — another file, the same name under another
  // root, the dialog closed, the pane gone — so a read still out can neither copy nor show anything.
  const retire = (): void => {
    latest += 1;
    shown.value = null;
    clearCopied();
  };
  watch([deps.cwd, deps.openPath], retire);
  onScopeDispose(retire);
  return { host: { open: (index) => void open(index), label: deps.label, diagramSourceLabel: deps.diagramSourceLabel }, shown, copied, close: retire };
}
