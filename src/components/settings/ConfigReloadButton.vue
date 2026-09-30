<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { reloadConfigFile, type ConfigReloadOutcome } from "../../composables/configReload";

// Reads ~/.mulmoterminal/config.json again after a hand-edit, or one an agent made with its own
// tools (#2627). What the server adopted reaches this page by reloading it: every screen then reads
// the config the one way it always does, rather than a second path that could miss one.
const emit = defineEmits<{ (e: "reloaded"): void }>();
const { t } = useI18n();
const busy = ref(false);
const refusal = ref<Extract<ConfigReloadOutcome, { ok: false }> | null>(null);

async function reload() {
  busy.value = true;
  const outcome = await reloadConfigFile();
  busy.value = false;
  if (outcome.ok) {
    refusal.value = null;
    emit("reloaded");
    return;
  }
  refusal.value = outcome;
}
</script>

<template>
  <div class="mt-1">
    <button
      type="button"
      class="inline-flex cursor-pointer items-center gap-1 rounded-md border border-border bg-transparent px-2 py-0.5 text-[11px] text-muted hover:bg-hover hover:text-fg disabled:cursor-default disabled:opacity-50"
      data-testid="settings-config-reload"
      :disabled="busy"
      :data-tip="t('settingsControls.configReload.tip')"
      @click="reload"
    >
      <span class="material-symbols-outlined text-[14px]" aria-hidden="true">sync</span>
      {{ t("settingsControls.configReload.button") }}
    </button>
    <div v-if="refusal" role="alert" class="mt-1 text-[11px] text-err-text" data-testid="settings-config-reload-refused">
      <p class="m-0">{{ refusal.error }}</p>
      <pre v-if="refusal.problems.length" class="m-0 whitespace-pre-wrap font-mono">{{ refusal.problems.join("\n") }}</pre>
    </div>
  </div>
</template>
