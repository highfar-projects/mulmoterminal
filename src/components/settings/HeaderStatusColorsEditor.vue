<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { HEADER_STATUS_KEYS, type HeaderStatusColors, type HeaderStatusKey } from "../../../common/headerStatusColors";
import { headerStatusStyleFor } from "../cellHeaderStyle";
import { HEADER_STATUS } from "../cellStatusClasses";
import { cssColorToHex, withoutStatus, withStatusBackground, withStatusText } from "./headerStatusColorEdit";

// One row per status: a sample header painted by the SAME class and style the grid cell uses, so what
// the row shows is what a terminal will show — including the theme's own wash while nothing is set.
//
// It edits whichever set it is handed — the global default, or one directory's (#2724) — and says
// what the set should become; the owner saves it and locks the rows while it does.
const props = defineProps<{ colors: HeaderStatusColors; saving: boolean }>();
const emit = defineEmits<{ (e: "change", next: HeaderStatusColors): void }>();
const { t } = useI18n();
const samples = ref<Partial<Record<HeaderStatusKey, HTMLElement>>>({});

const keepSample = (key: HeaderStatusKey, el: unknown) => {
  if (el instanceof HTMLElement) samples.value[key] = el;
};

// Where a picker starts when a status has no colour yet: whatever the theme paints there now. A
// theme wash built with color-mix() computes to a form cssColorToHex does not read, so each status
// has a start of its own in that case — in the family of the colour it replaces.
const FALLBACK_START: Record<HeaderStatusKey, Record<"backgroundColor" | "color", string>> = {
  working: { backgroundColor: "#1b3a6b", color: "#ffffff" },
  done: { backgroundColor: "#1f5135", color: "#ffffff" },
  blocked: { backgroundColor: "#5c4212", color: "#ffd27a" },
};
const startColour = (key: HeaderStatusKey, part: "backgroundColor" | "color"): string => {
  const sample = samples.value[key];
  return (sample && cssColorToHex(getComputedStyle(sample)[part])) ?? FALLBACK_START[key][part];
};

// A header with no directory colour of its own. The tint is left out on purpose: "none" keeps a
// DIRECTORY's colour, and a header without one shows the same thing under either mode.
const sampleStyle = (key: HeaderStatusKey) => headerStatusStyleFor(key, { headerColor: null, headerTextColor: null, statusColors: props.colors, tint: null });

const statusName = (key: HeaderStatusKey) => t(`settingsControls.headerColors.statuses.${key}`);
const partLabel = (key: HeaderStatusKey, part: "background" | "text") =>
  t("settingsControls.headerColors.partOf", { part: t(`settingsControls.headerColors.${part}`), status: statusName(key) });

const save = (next: HeaderStatusColors) => emit("change", next);

const pickedColour = (e: Event): string | null => (e.target instanceof HTMLInputElement ? e.target.value : null);

function onBackground(key: HeaderStatusKey, e: Event) {
  const hex = pickedColour(e);
  if (hex) save(withStatusBackground(props.colors, key, hex));
}

function onText(key: HeaderStatusKey, e: Event) {
  const hex = pickedColour(e);
  if (hex) save(withStatusText(props.colors, key, hex));
}

const startBackground = (key: HeaderStatusKey) => save(withStatusBackground(props.colors, key, startColour(key, "backgroundColor")));
const startText = (key: HeaderStatusKey) => save(withStatusText(props.colors, key, startColour(key, "color")));
const autoText = (key: HeaderStatusKey) => save(withStatusText(props.colors, key, null));
const reset = (key: HeaderStatusKey) => save(withoutStatus(props.colors, key));
</script>

<template>
  <ul class="mb-3 flex flex-col gap-1.5" data-testid="settings-header-colors">
    <li v-for="key in HEADER_STATUS_KEYS" :key="key" class="flex flex-wrap items-center gap-2 rounded-md bg-elevated px-2 py-1.5" :data-status="key">
      <span
        :ref="(el) => keepSample(key, el)"
        class="w-[92px] rounded border-b-2 px-2 py-0.5 text-[12px]"
        :class="HEADER_STATUS[key]"
        :style="sampleStyle(key)"
        data-testid="header-color-sample"
        >{{ t(`settingsControls.headerColors.statuses.${key}`) }}</span
      >
      <span class="flex items-center gap-1 text-[11px] text-dim">
        <span aria-hidden="true">{{ t("settingsControls.headerColors.background") }}</span>
        <input
          v-if="colors[key]?.background"
          type="color"
          class="h-6 w-8 cursor-pointer rounded border border-border bg-transparent"
          data-testid="header-color-background"
          :aria-label="partLabel(key, 'background')"
          :value="colors[key]?.background"
          :disabled="saving"
          @change="(e) => onBackground(key, e)"
        />
        <button
          v-else
          type="button"
          class="cursor-pointer rounded border border-border px-1.5 py-0.5 text-[11px] text-muted hover:text-fg disabled:cursor-default"
          data-testid="header-color-background-start"
          :aria-label="`${partLabel(key, 'background')}: ${t('settingsControls.headerColors.theme')}`"
          :disabled="saving"
          @click="startBackground(key)"
        >
          {{ t("settingsControls.headerColors.theme") }}
        </button>
      </span>
      <span class="flex items-center gap-1 text-[11px] text-dim">
        <span aria-hidden="true">{{ t("settingsControls.headerColors.text") }}</span>
        <template v-if="colors[key]?.text">
          <input
            type="color"
            class="h-6 w-8 cursor-pointer rounded border border-border bg-transparent"
            data-testid="header-color-text"
            :aria-label="partLabel(key, 'text')"
            :value="colors[key]?.text"
            :disabled="saving"
            @change="(e) => onText(key, e)"
          />
          <button
            type="button"
            class="cursor-pointer rounded border border-border px-1.5 py-0.5 text-[11px] text-muted hover:text-fg disabled:cursor-default"
            data-testid="header-color-text-auto"
            :aria-label="`${partLabel(key, 'text')}: ${t('settingsControls.headerColors.auto')}`"
            :disabled="saving"
            @click="autoText(key)"
          >
            {{ t("settingsControls.headerColors.auto") }}
          </button>
        </template>
        <button
          v-else
          type="button"
          class="cursor-pointer rounded border border-border px-1.5 py-0.5 text-[11px] text-muted hover:text-fg disabled:cursor-default"
          data-testid="header-color-text-start"
          :aria-label="`${partLabel(key, 'text')}: ${t('settingsControls.headerColors.autoState')}`"
          :disabled="saving"
          @click="startText(key)"
        >
          {{ t("settingsControls.headerColors.autoState") }}
        </button>
      </span>
      <span class="flex-auto" />
      <button
        v-if="colors[key]"
        type="button"
        class="cursor-pointer border-0 bg-transparent p-0 text-[11px] text-dim underline hover:text-fg disabled:cursor-default"
        data-testid="header-color-reset"
        :aria-label="`${statusName(key)}: ${t('settingsControls.headerColors.reset')}`"
        :disabled="saving"
        @click="reset(key)"
      >
        {{ t("settingsControls.headerColors.reset") }}
      </button>
    </li>
  </ul>
</template>
