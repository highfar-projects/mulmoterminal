<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { showLoadAverage, saveShowLoadAverage } from "../../composables/showLoadAverage";
import { paletteSearchBox, savePaletteSearchBox } from "../../composables/paletteSearchBox";
import { usageGauge, saveUsageGauge, usageProbeIntervalMinutes, saveUsageProbeIntervalMinutes } from "../../composables/usageGauge";
import { MIN_USAGE_PROBE_INTERVAL_MINUTES, MAX_USAGE_PROBE_INTERVAL_MINUTES } from "../../../common/usageGauge";
import SettingsStepper from "./SettingsStepper.vue";

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

async function onUsageGaugeToggle(e: Event) {
  if (!(e.target instanceof HTMLInputElement)) return;
  const input = e.target;
  if (!(await saveUsageGauge(input.checked))) input.checked = usageGauge.value;
}

const PROBE_INTERVAL_STEP_MINUTES = 1;
function nudgeProbeInterval(delta: number) {
  void saveUsageProbeIntervalMinutes(usageProbeIntervalMinutes.value + delta);
}

async function onSearchBoxToggle(e: Event) {
  if (!(e.target instanceof HTMLInputElement)) return;
  const input = e.target;
  if (!(await savePaletteSearchBox(input.checked))) input.checked = paletteSearchBox.value;
}
</script>

<template>
  <p class="mb-2 mt-1.5 text-[12px] text-dim">{{ t("settings.gridHeader.intro") }}</p>
  <label class="mt-1.5 flex cursor-pointer items-start gap-2">
    <input
      type="checkbox"
      class="mt-1 cursor-pointer"
      :checked="usageGauge"
      :aria-label="t('settingsControls.usageGauge.field')"
      data-testid="settings-usage-gauge"
      @change="(e) => void onUsageGaugeToggle(e)"
    />
    <span class="text-[12px]">
      <strong>{{ t("settingsControls.usageGauge.title") }}</strong> — {{ t("settingsControls.usageGauge.hint") }}
    </span>
  </label>
  <div class="mb-3 ml-5 mt-2" :class="usageGauge ? '' : 'pointer-events-none opacity-50'">
    <p class="mb-1.5 text-[12px] text-dim">{{ t("settingsControls.usageGauge.interval") }}</p>
    <SettingsStepper
      :value="usageProbeIntervalMinutes"
      :unit="' min'"
      :min="MIN_USAGE_PROBE_INTERVAL_MINUTES"
      :max="MAX_USAGE_PROBE_INTERVAL_MINUTES"
      :step="PROBE_INTERVAL_STEP_MINUTES"
      :label="t('settingsControls.usageGauge.stepper')"
      :disabled="!usageGauge"
      @nudge="nudgeProbeInterval"
    />
  </div>
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
  <label class="mt-1.5 flex cursor-pointer items-start gap-2">
    <input
      type="checkbox"
      class="mt-1 cursor-pointer"
      :checked="paletteSearchBox"
      :aria-label="t('settings.gridHeader.searchBox')"
      @change="(e) => void onSearchBoxToggle(e)"
    />
    <span class="text-[12px]">
      <strong>{{ t("settings.gridHeader.searchBoxTitle") }}</strong> — {{ t("settings.gridHeader.searchBoxHint") }}
    </span>
  </label>
</template>
