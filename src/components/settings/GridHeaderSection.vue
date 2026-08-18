<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { showLoadAverage, saveShowLoadAverage } from "../../composables/showLoadAverage";

// The read-outs along the top of the grid, as opposed to the ones on a cell's own header
// (headerChrome) or in the roster beside an enlarged one (waitingRows).
const { t } = useI18n();

// The browser has already flipped the box by the time this runs, and a refused save leaves the
// flag where it was — so nothing would move it back, and the screen would show a setting the host
// never took (CodeRabbit on #1791).
async function onLoadAverageToggle(e: Event) {
  if (!(e.target instanceof HTMLInputElement)) return;
  const input = e.target;
  if (!(await saveShowLoadAverage(input.checked))) input.checked = showLoadAverage.value;
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
      @change="(e) => void onLoadAverageToggle(e)"
    />
    <span class="text-[12px]">
      <strong>{{ t("settings.gridHeader.loadAverageTitle") }}</strong> — {{ t("settings.gridHeader.loadAverageHint") }}
    </span>
  </label>
</template>
