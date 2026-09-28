<script setup lang="ts">
// "The issue is not being updated" on a cell whose work comment failed (#1369). WHICH cause is
// worth showing is `visibleWorkCommentFailure`; this is only how it looks.
//
// A prompt rather than a chip, for the same reason as CellTidyPrompt: a user who removed the
// `work` chip from their header still needs to be told that a setting they switched on is doing
// nothing. Muted rather than alarming — nothing is broken, the work carries on, and the issue is
// simply not being written to.
import { computed } from "vue";
import { workCommentNoticeText } from "../composables/workCommentNotice";
import type { WorkCommentFailure } from "../../common/workCommentFailure";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

const props = defineProps<{ failure: WorkCommentFailure }>();
const emit = defineEmits<{ (e: "dismiss"): void }>();

const notice = computed(() => workCommentNoticeText(props.failure));
</script>

<template>
  <span
    data-testid="work-comment-notice"
    class="inline-flex flex-none items-center gap-1 rounded-[10px] border border-border bg-elevated px-[7px] py-px font-mono text-[11px] text-muted"
    :data-tip="t(notice.titleKey)"
  >
    <span class="material-symbols-outlined text-[13px]" aria-hidden="true">comments_disabled</span>
    <span data-testid="work-comment-notice-label">{{ notice.label }}</span>
    <button
      type="button"
      data-testid="work-comment-notice-dismiss"
      class="inline-flex cursor-pointer items-center border-none bg-transparent p-0 text-inherit opacity-60 hover:opacity-100"
      :data-tip="t('tips.cell.workCommentDismiss')"
      :aria-label="t('tips.cell.workCommentDismissAria')"
      @click.stop="emit('dismiss')"
    >
      <span class="material-symbols-outlined text-[13px]" aria-hidden="true">close</span>
    </button>
  </span>
</template>
