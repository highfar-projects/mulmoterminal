<script setup lang="ts">
import { useI18n } from "vue-i18n";

// Shown while the pane is in tmux copy-mode, where every key goes to tmux and none reaches the
// program — the state that reads as "the terminal stopped taking input" (#2207).
const emit = defineEmits<{ exit: [] }>();
const { t } = useI18n();
</script>

<template>
  <div
    data-testid="copy-mode-banner"
    class="absolute left-1/2 z-20 flex max-w-[min(90%,560px)] -translate-x-1/2 items-center gap-3 rounded-lg border-2 border-[#c98a00] bg-[#ffd54a] px-4 py-2 font-sans text-[13px] font-semibold leading-[1.4] text-[#1a1a2e] shadow-[0_4px_16px_rgba(0,0,0,0.45)]"
    role="status"
  >
    <span class="material-symbols-outlined shrink-0 text-[18px]" aria-hidden="true">history</span>
    <span>{{ t("terminal.copyMode.message") }}</span>
    <button
      type="button"
      data-testid="copy-mode-exit"
      class="shrink-0 cursor-pointer rounded-md border border-[#1a1a2e] bg-transparent px-2 py-0.5 font-sans text-[13px] font-semibold text-[#1a1a2e] hover:bg-[#1a1a2e] hover:text-[#ffd54a]"
      @click="emit('exit')"
    >
      {{ t("terminal.copyMode.exit") }}
    </button>
  </div>
</template>
