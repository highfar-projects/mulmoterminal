<script setup lang="ts">
// A directory's terminal background (#2726): the picture, how strongly it shows and how it fills the
// cell. Each change is saved as soon as it is final; an empty picture takes the key out.
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import type { DirConfigEdit } from "../../../common/dirConfigForm";
import { DIR_BACKGROUND_DEFAULT_FIT, DIR_BACKGROUND_DEFAULT_OPACITY, DIR_BACKGROUND_FITS, isDirBackgroundFit } from "../../../common/dirBackground";
import { backgroundFromValue, editForBackground, type DirBackgroundDraft } from "../dirMedia";

const props = defineProps<{ value: unknown; saving: boolean }>();
const emit = defineEmits<{ (e: "change", edit: DirConfigEdit): void }>();
const { t } = useI18n();

const current = computed(() => backgroundFromValue(props.value));
const draftWith = (change: Partial<DirBackgroundDraft>): DirBackgroundDraft => ({
  image: current.value?.image ?? "",
  opacity: current.value?.opacity ?? DIR_BACKGROUND_DEFAULT_OPACITY,
  fit: current.value?.fit ?? DIR_BACKGROUND_DEFAULT_FIT,
  rest: current.value?.rest ?? {},
  ...change,
});

function commit(background: DirBackgroundDraft | null): void {
  const edit = editForBackground(background);
  if (edit) emit("change", edit);
}

function onImage(e: Event): void {
  if (!(e.target instanceof HTMLInputElement)) return;
  const image = e.target.value.trim();
  if (image === (current.value?.image ?? "")) return;
  commit(image === "" ? null : draftWith({ image }));
}

function onOpacity(e: Event): void {
  if (e.target instanceof HTMLInputElement && current.value) commit(draftWith({ opacity: Number(e.target.value) }));
}

function onFit(e: Event): void {
  if (e.target instanceof HTMLSelectElement && isDirBackgroundFit(e.target.value) && current.value) commit(draftWith({ fit: e.target.value }));
}

const PERCENT = 100;
const OPACITY_MIN = 0.05;
const OPACITY_STEP = 0.05;
const CONTROL = "min-w-0 rounded border border-border bg-elevated px-1.5 py-0.5 text-[12px] text-fg disabled:opacity-60";
</script>

<template>
  <div class="flex flex-col gap-1" data-testid="dir-background">
    <input
      id="dir-form-backgroundImage"
      type="text"
      :class="[CONTROL, 'font-mono']"
      :value="current?.image ?? ''"
      :placeholder="t('dirSettingsForm.background.placeholder')"
      :disabled="saving"
      @change="onImage"
    />
    <span v-if="current" class="flex flex-wrap items-center gap-2 text-[11px] text-dim">
      <label class="flex items-center gap-1.5">
        {{ t("dirSettingsForm.background.opacity") }}
        <input
          type="range"
          :min="OPACITY_MIN"
          max="1"
          :step="OPACITY_STEP"
          :value="current.opacity"
          :disabled="saving"
          data-testid="dir-background-opacity"
          @change="onOpacity"
        />
        <span class="w-9 font-mono text-fg">{{ Math.round(current.opacity * PERCENT) }}%</span>
      </label>
      <label class="flex items-center gap-1.5">
        {{ t("dirSettingsForm.background.fit") }}
        <select :class="CONTROL" :value="current.fit" :disabled="saving" data-testid="dir-background-fit" @change="onFit">
          <option v-for="fit in DIR_BACKGROUND_FITS" :key="fit" :value="fit">{{ t(`dirSettingsForm.background.fits.${fit}`) }}</option>
        </select>
      </label>
    </span>
  </div>
</template>
