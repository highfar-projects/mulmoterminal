<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { requestedSettingsDir } from "../../composables/settingsOpener";
import DirConfigPreview from "../DirConfigPreview.vue";
import SkillLaunchButton from "../SkillLaunchButton.vue";
import type { BundledSkillName } from "../../../common/bundledSkills";

const props = defineProps<{ dirPaths?: string[] | undefined }>();
const emit = defineEmits<{ (e: "launch-skill", skill: BundledSkillName): void; (e: "open-file", dir: string, name: string): void }>();

const { t } = useI18n();

// A directory a cell asked for (#2729): taken once, listed even when it is not one of the recent
// directories, and opened by the preview.
const focus = ref<string | null>(null);
watch(
  requestedSettingsDir,
  (dir) => {
    if (dir === null) return;
    focus.value = dir;
    requestedSettingsDir.value = null;
  },
  { immediate: true },
);
const paths = computed(() => {
  const listed = props.dirPaths ?? [];
  return focus.value === null || listed.includes(focus.value) ? listed : [...listed, focus.value];
});
</script>

<template>
  <i18n-t keypath="settings.dirSettings.intro" tag="p" class="mb-1 mt-1.5 text-[12px] text-dim">
    <template #dirFile><code>.mulmoterminal.json</code></template>
  </i18n-t>
  <DirConfigPreview :paths="paths" :focus="focus" @open-file="(dir, name) => emit('open-file', dir, name)" />
  <p class="mb-3 mt-2.5 text-[12px] text-dim">{{ t("settings.dirSettings.outro") }}</p>
  <SkillLaunchButton skill="mulmoterminal-config" icon="troubleshoot" :label="t('settings.dirSettings.explain')" @launch="emit('launch-skill', $event)" />
</template>
