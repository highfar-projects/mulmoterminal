// Copies the open file's text from the editor's own document (#3058). A drag selection that crosses
// the line-number gutter is copied by the browser as two side-by-side boxes, joined with tabs and
// newlines; the document is the text as it is, unsaved edits included.
import type { Ref } from "vue";
import type { CmEditor } from "../components/cmEditor";
import { clipboardAvailable } from "../components/codeBlockCopy";
import { copiedNoticeFor, type CopiedNotice } from "../components/previewCodeCopy";
import { useCopiedNotice } from "./useCopiedNotice";

export interface FileTextCopy {
  /** False on a page the browser gives no clipboard (plain http on a LAN address): no button then. */
  available: boolean;
  copy: () => Promise<boolean>;
  copied: Ref<CopiedNotice | null>;
}

export function useFileTextCopy(editor: () => CmEditor | null): FileTextCopy {
  const notice = useCopiedNotice();
  const copy = async (): Promise<boolean> => {
    // An earlier success's toast must not stand for this attempt, which may fail.
    notice.clear();
    const text = editor()?.getDoc();
    if (text === undefined) return false;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      return false;
    }
    notice.show(copiedNoticeFor(text));
    return true;
  };
  return { available: clipboardAvailable(), copy, copied: notice.copied };
}
