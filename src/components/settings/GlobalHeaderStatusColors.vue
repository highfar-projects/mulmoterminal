<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import type { HeaderStatusColors } from "../../../common/headerStatusColors";
import { globalHeaderStatusColors, saveHeaderStatusColors } from "../../composables/headerStatusColors";
import HeaderStatusColorsEditor from "./HeaderStatusColorsEditor.vue";

// The default status colours for every directory, saved to the global config.
const { t } = useI18n();

// Locked while saving, so an earlier edit's answer cannot land after a later one.
const saving = ref(false);

async function onChange(next: HeaderStatusColors) {
  saving.value = true;
  await saveHeaderStatusColors(next);
  saving.value = false;
}
</script>

<template>
  <p class="mb-1.5 mt-2 text-[12px] text-dim">
    <strong class="text-fg">{{ t("settingsControls.headerColors.title") }}</strong> (<code>headerStatusColors</code>) —
    {{ t("settingsControls.headerColors.hint") }}
  </p>
  <HeaderStatusColorsEditor :colors="globalHeaderStatusColors" :saving="saving" @change="(next) => void onChange(next)" />
</template>
