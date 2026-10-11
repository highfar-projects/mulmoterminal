// The Preview's code-block button (#2615, #3003): a press names a block's number, and the block is read
// from the file. It is copied at once with a short notice; the dialog opens only when it cannot be —
// hidden characters, no Clipboard API, a refused write, or a block that is gone. Only the latest press
// counts, and only while that file is open.
import { onScopeDispose, ref, watch, type Ref } from "vue";
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

const COPIED_NOTICE_MS = 2500;

export function usePreviewCodeBlock(deps: PreviewCodeBlockDeps): PreviewCodeBlockDialogState {
  const shown = ref<CodeBlockLookup | null>(null);
  const copied = ref<CopiedNotice | null>(null);
  let latest = 0;
  let noticeTimer: ReturnType<typeof setTimeout> | undefined;
  const clearCopied = (): void => {
    clearTimeout(noticeTimer);
    copied.value = null;
  };
  const showCopied = (notice: CopiedNotice): void => {
    clearCopied();
    copied.value = notice;
    noticeTimer = setTimeout(() => (copied.value = null), COPIED_NOTICE_MS);
  };
  const open = async (index: number): Promise<void> => {
    const path = deps.openPath();
    if (!path) return;
    const request = ++latest;
    clearCopied();
    const lookup = previewCodeBlockAt(deps.cwd(), path, index);
    // Started before the read finishes, so the write still counts as the press's (see writeClipboardLater).
    // The text is withheld if a newer press, or another file, came first: the browser does not order two
    // pending writes, so an older block would otherwise land on the clipboard after a newer one.
    const current = lookup.then((answer) => (request === latest ? directCopyText(answer) : null));
    const written = clipboardAvailable() ? writeClipboardLater(current) : Promise.resolve(false);
    const [answer, copiedNow] = await Promise.all([lookup, written]);
    if (request !== latest) return;
    if (copiedNow && answer.status === "found") showCopied(copiedNoticeFor(answer.block.text));
    else shown.value = answer;
  };
  // Another file, or the same name under another root: a block read for the old one is not this one's.
  watch([deps.cwd, deps.openPath], () => {
    latest += 1;
    shown.value = null;
    clearCopied();
  });
  // Closing retires a read still out, as a change of file does: its answer must not reopen the dialog.
  const close = (): void => {
    latest += 1;
    shown.value = null;
  };
  onScopeDispose(() => clearTimeout(noticeTimer));
  return { host: { open: (index) => void open(index), label: deps.label, diagramSourceLabel: deps.diagramSourceLabel }, shown, copied, close };
}
