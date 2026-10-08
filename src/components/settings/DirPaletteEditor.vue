<script setup lang="ts">
// A directory's terminal palette (`colors`, #2724): one row per xterm colour, over the theme the
// directory uses. Folded by default — it is twenty-three rows most directories never touch. It says
// what the palette should become; the form saves it.
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { THEME_COLOR_KEYS, type ThemeColorKey } from "../../../common/themeColors";
import { pickerColor, withPaletteColor, type DirPalette } from "../dirPalette";

// `redraw` changes after every save attempt, which redraws the rows from `palette` — a pick the save
// refused goes back to what the file holds — without folding the list the user has open.
const props = defineProps<{ palette: DirPalette; saving: boolean; redraw: number }>();
const emit = defineEmits<{ (e: "change", next: DirPalette): void }>();
const { t } = useI18n();

const setCount = computed(() => Object.keys(props.palette).length);

function onPick(key: ThemeColorKey, e: Event): void {
  if (!(e.target instanceof HTMLInputElement) || e.target.value === props.palette[key]) return;
  emit("change", withPaletteColor(props.palette, key, e.target.value));
}

const CLEAR_BUTTON =
  "cursor-pointer rounded border border-border bg-elevated px-1.5 py-0.5 font-sans text-[11px] text-secondary hover:bg-hover hover:text-fg disabled:opacity-60";
</script>

<template>
  <details class="mt-1" data-testid="dir-palette">
    <summary class="cursor-pointer text-[12px] text-dim">
      {{ t("dirSettingsForm.palette.summary", { count: setCount }, setCount) }}
    </summary>
    <div class="mt-1 grid grid-cols-[max-content_max-content_1fr] items-center gap-x-2 gap-y-1">
      <template v-for="key in THEME_COLOR_KEYS" :key="`${key}-${redraw}`">
        <label :for="`dir-palette-${key}`" class="font-mono text-[11px] text-dim">{{ key }}</label>
        <input
          :id="`dir-palette-${key}`"
          type="color"
          class="h-6 w-8 cursor-pointer rounded border border-border bg-transparent p-0 disabled:opacity-60"
          :value="pickerColor(palette[key])"
          :disabled="saving"
          :data-testid="`dir-palette-input-${key}`"
          @change="onPick(key, $event)"
        />
        <span class="flex items-center gap-1.5">
          <span class="font-mono text-[11px]" :class="palette[key] ? 'text-fg' : 'text-dim'">{{ palette[key] ?? t("dirSettingsForm.notSet") }}</span>
          <button
            v-if="palette[key]"
            type="button"
            :class="CLEAR_BUTTON"
            :disabled="saving"
            :aria-label="t('dirSettingsForm.palette.clear', { key })"
            :data-testid="`dir-palette-clear-${key}`"
            @click="emit('change', withPaletteColor(palette, key, null))"
          >
            {{ t("dirSettingsForm.palette.theme") }}
          </button>
        </span>
      </template>
    </div>
  </details>
</template>
