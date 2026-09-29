<script setup lang="ts">
// What entering focus mode did (#2580) — in particular that this browser could not capture the keys,
// which is otherwise discovered by pressing Cmd+W and losing the tab.
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { focusModeNotice } from "../composables/focusMode";

const { t } = useI18n();
const message = computed(() => (focusModeNotice.value ? t(`focusMode.${focusModeNotice.value}`) : null));
</script>

<template>
  <div
    v-if="message"
    role="status"
    aria-live="polite"
    data-testid="focus-mode-notice"
    class="pointer-events-none fixed bottom-4 left-1/2 z-[70] max-w-[420px] -translate-x-1/2 rounded-lg border border-border bg-panel px-3 py-2 font-sans text-[12px] text-fg shadow-xl"
  >
    {{ message }}
  </div>
</template>
