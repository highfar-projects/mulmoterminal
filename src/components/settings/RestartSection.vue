<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { restartServer } from "../../composables/useServerRestart";
import { useUpdateStatus } from "../../composables/useUpdateStatus";

// Fork-only: restart MulmoTerminal from the browser, above upstream's Quit. One click, no
// confirmation: unlike a stop, nothing is left down — the sessions are tmux-backed and reattach,
// and the page reloads onto the server that comes back.
const { t } = useI18n();
const { status } = useUpdateStatus();

const pending = ref(false);
const failed = ref(false);

async function restart(): Promise<void> {
  if (pending.value) return;
  pending.value = true;
  failed.value = false;
  if (!(await restartServer())) {
    pending.value = false;
    failed.value = true;
  }
}
</script>

<template>
  <section class="mb-5 border-b border-border pb-5" data-testid="restart-section">
    <p class="mb-2 text-[12px]">{{ status?.relaunch ? t("forkTips.restart.descriptionRelaunch") : t("forkTips.restart.description") }}</p>
    <p v-if="!status?.relaunch" class="mb-3 text-[12px] text-dim">{{ t("forkTips.restart.relaunchHint") }}</p>
    <button
      type="button"
      data-testid="restart-server"
      class="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border bg-transparent px-3 py-1.5 text-[13px] text-fg hover:bg-hover disabled:cursor-default disabled:opacity-60"
      :disabled="pending"
      @click="restart"
    >
      <span class="material-symbols-outlined text-[16px] leading-none" aria-hidden="true">restart_alt</span>
      {{ t("forkTips.restart.button") }}
    </button>
    <p v-if="failed" data-testid="restart-failed" class="mt-2 text-[12px] text-[var(--err-text)]">{{ t("forkTips.restart.failed") }}</p>
  </section>
</template>
