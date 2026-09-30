<script setup lang="ts">
// A directory's icon (#2726): the repository's own favicon found automatically (the key absent),
// none at all (`false`), or an image the file names — a path relative to the directory, an http(s)
// URL or a data: image. It says what the key should become; the form saves it.
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import type { DirConfigEdit } from "../../../common/dirConfigForm";
import { editForIcon, iconMode, type DirIconMode } from "../dirMedia";

const props = defineProps<{ value: unknown; saving: boolean }>();
const emit = defineEmits<{ (e: "change", edit: DirConfigEdit): void }>();
const { t } = useI18n();

const MODES: readonly DirIconMode[] = ["auto", "none", "image"];
// Choosing "an image" shows the path field before there is anything to write.
const pending = ref<DirIconMode | null>(null);
const mode = computed(() => pending.value ?? iconMode(props.value));
const image = computed(() => (typeof props.value === "string" ? props.value : ""));

const isMode = (value: string): value is DirIconMode => MODES.some((known) => known === value);

function onMode(e: Event): void {
  if (!(e.target instanceof HTMLSelectElement) || !isMode(e.target.value)) return;
  const edit = editForIcon(e.target.value, image.value);
  pending.value = edit ? null : e.target.value;
  if (edit) emit("change", edit);
}

function onImage(e: Event): void {
  if (!(e.target instanceof HTMLInputElement) || e.target.value.trim() === image.value) return;
  const edit = editForIcon("image", e.target.value);
  if (edit) emit("change", edit);
}

const CONTROL = "min-w-0 rounded border border-border bg-elevated px-1.5 py-0.5 text-[12px] text-fg disabled:opacity-60";
</script>

<template>
  <span class="flex min-w-0 flex-auto items-center gap-1.5">
    <select id="dir-form-icon" :class="CONTROL" :value="mode" :disabled="saving" @change="onMode">
      <option v-for="known in MODES" :key="known" :value="known">{{ t(`dirSettingsForm.icon.${known}`) }}</option>
    </select>
    <input
      v-if="mode === 'image'"
      type="text"
      :class="[CONTROL, 'flex-auto font-mono']"
      :value="image"
      :placeholder="t('dirSettingsForm.icon.placeholder')"
      :aria-label="t('dirSettingsForm.icon.path')"
      :disabled="saving"
      data-testid="dir-form-icon-path"
      @change="onImage"
    />
  </span>
</template>
