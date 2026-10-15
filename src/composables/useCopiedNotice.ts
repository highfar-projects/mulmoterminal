// The "Copied!" toast's state: shown for a moment after a copy, cleared by the next one.
import { onScopeDispose, ref, type Ref } from "vue";
import type { CopiedNotice } from "../components/previewCodeCopy";

const COPIED_NOTICE_MS = 2500;

export interface CopiedNoticeState {
  copied: Ref<CopiedNotice | null>;
  show: (notice: CopiedNotice) => void;
  clear: () => void;
}

export function useCopiedNotice(): CopiedNoticeState {
  const copied = ref<CopiedNotice | null>(null);
  let noticeTimer: ReturnType<typeof setTimeout> | undefined;
  const clear = (): void => {
    clearTimeout(noticeTimer);
    copied.value = null;
  };
  const show = (notice: CopiedNotice): void => {
    clear();
    copied.value = notice;
    noticeTimer = setTimeout(() => (copied.value = null), COPIED_NOTICE_MS);
  };
  onScopeDispose(clear);
  return { copied, show, clear };
}
