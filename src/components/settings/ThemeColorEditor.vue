<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import SettingsButton from "../SettingsButton.vue";
import SettingsField from "../SettingsField.vue";
import { THEME_VAR_KEYS, type ThemeVarKey, type ThemeVars } from "../../../common/themeVars";
import type { ThemeProblem } from "../../../common/themeEntries";
import { findCustomTheme } from "../../composables/customThemes";
import { DEFAULT_THEME, previewCustomTheme, refreshTheme, resolvedThemeVars, useTheme } from "../../composables/useTheme";
import { changeCustomThemes, type ThemeAction } from "../../composables/themeEditing";
import { copyLabel, draftDiffers, pickerValue, withDraftColors } from "./themeColorDraft";

// Make a theme of your own from the one in use, and change its colours (#2623). A change is painted
// at once so it can be judged on the real app, and is kept only on Save; leaving discards it.
const { t } = useI18n();
const { themeId, themes, setTheme } = useTheme();

const custom = computed(() => findCustomTheme(themeId.value));
const currentLabel = computed(() => themes.value.find((theme) => theme.id === themeId.value)?.label ?? themeId.value);

const draft = ref<Partial<ThemeVars>>({});
const saving = ref(false);
const problem = ref<ThemeProblem | null>(null);
const refused = ref(false);
const copyName = ref("");

function resetDraft() {
  draft.value = { ...(custom.value?.colors ?? {}) };
  copyName.value = copyLabel(currentLabel.value, t("themeEditor.copySuffix"));
}
watch(themeId, resetDraft, { immediate: true });

const resolved = computed(() => (custom.value ? resolvedThemeVars(withDraftColors(custom.value, draft.value)) : null));
const dirty = computed(() => custom.value !== null && draftDiffers(custom.value.colors, draft.value));

function onColor(key: ThemeVarKey, event: Event) {
  if (!(event.target instanceof HTMLInputElement) || !custom.value) return;
  draft.value = { ...draft.value, [key]: event.target.value };
  previewCustomTheme(withDraftColors(custom.value, draft.value));
}

function discard() {
  resetDraft();
  refreshTheme();
}
// A draft nobody saved must not stay painted after Settings closes.
onBeforeUnmount(() => {
  if (dirty.value) refreshTheme();
});

async function apply(action: ThemeAction, payload: Record<string, unknown>) {
  saving.value = true;
  const change = await changeCustomThemes(action, payload);
  saving.value = false;
  refused.value = !change.ok && change.problem === null;
  problem.value = change.ok ? null : change.problem;
  return change;
}

async function duplicate() {
  if (saving.value) return;
  const change = await apply("duplicate", { source: themeId.value, label: copyName.value });
  if (change.ok && typeof change.body.id === "string") setTheme(change.body.id);
}

async function save() {
  if (!custom.value || saving.value) return;
  if ((await apply("colors", { id: custom.value.id, colors: draft.value })).ok) resetDraft();
}

async function remove() {
  const theme = custom.value;
  if (!theme || saving.value) return;
  if ((await apply("remove", { id: theme.id })).ok) setTheme(theme.extends ?? DEFAULT_THEME);
}
</script>

<template>
  <p class="mb-1.5 mt-4 text-[12px] text-dim">
    <strong class="text-fg">{{ t("themeEditor.title") }}</strong> — {{ t("themeEditor.intro") }}
  </p>
  <div class="flex items-center gap-2">
    <SettingsField
      v-model="copyName"
      class="min-w-0 flex-auto"
      data-testid="theme-copy-label"
      :aria-label="t('themeEditor.copyField')"
      spellcheck="false"
      @keydown.enter="duplicate"
    />
    <SettingsButton data-testid="theme-duplicate" :disabled="saving" @click="duplicate">{{ t("themeEditor.duplicate") }}</SettingsButton>
  </div>
  <template v-if="custom">
    <p class="mb-1.5 mt-3 text-[12px] text-dim">{{ t("themeEditor.editing", { name: custom.label }) }}</p>
    <div class="grid grid-cols-2 gap-x-3 gap-y-1" data-testid="theme-colors">
      <label v-for="key in THEME_VAR_KEYS" :key="key" class="flex min-w-0 items-center gap-2 text-[11px]">
        <input
          type="color"
          class="h-6 w-8 shrink-0 cursor-pointer rounded border border-border bg-transparent p-0"
          :data-testid="`theme-color-${key}`"
          :value="pickerValue(key, draft, resolved)"
          :disabled="saving"
          @input="onColor(key, $event)"
        />
        <code class="min-w-0 truncate font-mono text-dim" :class="draft[key] ? 'font-semibold text-fg' : ''">{{ key }}</code>
      </label>
    </div>
    <div class="mt-2 flex flex-wrap items-center gap-2">
      <SettingsButton primary data-testid="theme-save" :disabled="!dirty || saving" @click="save">{{ t("themeEditor.save") }}</SettingsButton>
      <SettingsButton data-testid="theme-discard" :disabled="!dirty || saving" @click="discard">{{ t("themeEditor.discard") }}</SettingsButton>
      <SettingsButton data-testid="theme-remove" :disabled="saving" @click="remove">{{ t("themeEditor.remove", { name: custom.label }) }}</SettingsButton>
    </div>
    <p class="mt-1 text-[11px] text-dim">{{ t("themeEditor.hint") }}</p>
  </template>
  <p v-if="problem" class="mt-1 text-[11px] text-err-text" role="alert" data-testid="theme-problem">{{ t(`themeEditor.problems.${problem}`) }}</p>
  <p v-if="refused" class="mt-1 text-[11px] text-err-text" role="alert" data-testid="theme-refused">{{ t("settingsControls.entryProblems.refused") }}</p>
</template>
