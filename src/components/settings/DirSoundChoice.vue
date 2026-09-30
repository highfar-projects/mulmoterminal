<script setup lang="ts">
// One attention sound in a directory's config (#2726): a preset the app ships, or a file of the
// directory's own — a path relative to it, which the server confines to it. Empty means "not set
// here". It says what the value should become; the form saves it.
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { presetRef, SOUND_PRESETS } from "../../../common/notifySounds";
import { soundChoice } from "../dirMedia";

const props = defineProps<{ value: string; saving: boolean; inputId: string; unsetLabel: string }>();
const emit = defineEmits<{ (e: "change", next: string): void }>();
const { t } = useI18n();

// The select's value for "a file", which no preset ref can be (they all start with `preset:`).
const FILE = "file";
// Picking "a file" shows the path field before anything is saved; there is nothing to write yet.
const choosingFile = ref(false);

const choice = computed(() => (props.value === "" ? null : soundChoice(props.value)));
const selected = computed(() => {
  if (choosingFile.value || choice.value?.kind === "file") return FILE;
  return choice.value?.ref ?? "";
});

function onSelect(e: Event): void {
  if (!(e.target instanceof HTMLSelectElement)) return;
  const picked = e.target.value;
  choosingFile.value = picked === FILE;
  if (picked !== FILE) emit("change", picked);
}

function onPath(e: Event): void {
  if (!(e.target instanceof HTMLInputElement)) return;
  const path = e.target.value.trim();
  if (path !== "" && path !== props.value) emit("change", path);
}

const CONTROL = "min-w-0 rounded border border-border bg-elevated px-1.5 py-0.5 text-[12px] text-fg disabled:opacity-60";
</script>

<template>
  <span class="flex min-w-0 flex-auto items-center gap-1.5">
    <select :id="inputId" :class="CONTROL" :value="selected" :disabled="saving" @change="onSelect">
      <option value="">{{ unsetLabel }}</option>
      <option v-for="preset in SOUND_PRESETS" :key="preset.id" :value="presetRef(preset.id)">{{ preset.label }}</option>
      <option :value="FILE">{{ t("dirSettingsForm.sound.file") }}</option>
    </select>
    <input
      v-if="selected === FILE"
      type="text"
      :class="[CONTROL, 'flex-auto font-mono']"
      :value="choice?.kind === 'file' ? choice.path : ''"
      :placeholder="t('dirSettingsForm.sound.pathPlaceholder')"
      :aria-label="t('dirSettingsForm.sound.path')"
      :disabled="saving"
      :data-testid="`${inputId}-path`"
      @change="onPath"
    />
  </span>
</template>
