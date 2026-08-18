<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { showLoadAverage, saveShowLoadAverage } from "../../composables/showLoadAverage";

// The read-outs along the top of the grid, as opposed to the ones on a cell's own header
// (headerChrome) or in the roster beside an enlarged one (waitingRows).
const { t } = useI18n();

function onLoadAverageToggle(e: Event) {
  if (e.target instanceof HTMLInputElement) void saveShowLoadAverage(e.target.checked);
}
</script>

<template>
  <p class="mb-2 mt-1.5 text-[12px] text-dim">{{ t("settings.gridHeader.intro") }}</p>
  <label class="mt-1.5 flex cursor-pointer items-start gap-2">
    <input
      type="checkbox"
      class="mt-1 cursor-pointer"
      :checked="showLoadAverage"
      :aria-label="t('settings.gridHeader.loadAverage')"
      @change="onLoadAverageToggle"
    />
    <span class="text-[12px]">
      <strong>{{ t("settings.gridHeader.loadAverageTitle") }}</strong> — {{ t("settings.gridHeader.loadAverageHint") }}
    </span>
  </label>
</template>
