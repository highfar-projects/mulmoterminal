<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { serverRestartPhase, serverRestartRelaunches } from "../composables/useServerRestart";

// Fork-only: up from the moment POST /api/restart is answered until the page reloads onto the
// server that came back. Over everything, as the stopped screen is: nothing behind it answers.
const { t } = useI18n();
</script>

<template>
  <div
    v-if="serverRestartPhase !== 'idle'"
    data-testid="server-restarting-overlay"
    class="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-6"
  >
    <div role="alert" aria-live="assertive" class="max-w-md rounded-[10px] border border-border bg-panel p-6 text-center font-sans text-fg shadow-xl">
      <p class="flex items-center justify-center gap-2 text-[14px] font-semibold">
        <span class="material-symbols-outlined animate-spin text-[18px] leading-none" aria-hidden="true">progress_activity</span>
        {{ t("forkTips.restart.restartingTitle") }}
      </p>
      <p class="mt-2 text-[12px] text-dim">
        {{ serverRestartRelaunches ? t("forkTips.restart.restartingBodyRelaunch") : t("forkTips.restart.restartingBody") }}
      </p>
      <p v-if="serverRestartPhase === 'slow'" data-testid="server-restarting-slow" class="mt-3 text-[12px] text-[var(--err-text)]">
        {{ t("forkTips.restart.slow") }}
      </p>
    </div>
  </div>
</template>
