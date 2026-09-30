<script setup lang="ts">
// The Settings form for one directory's config (#2722): one row per key it edits, each saved on its
// own as soon as the change is final. The server answers with the directory's detail as it now is,
// and the form is always drawn from that — never from what it sent — so a value the server wrote
// somewhere unexpected, or refused, is what the row shows next.
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useTheme } from "../../composables/useTheme";
import type { DirConfigEdit, DirFormKey } from "../../../common/dirConfigForm";
import { HEADER_STATUS_TINTS, headerStatusColorsForFile, sanitizeHeaderStatusColors, type HeaderStatusColors } from "../../../common/headerStatusColors";
import type { DirConfigDetailView } from "../dirConfigDetail";
import { saveDirConfigEdit, type DirConfigSaveFailure } from "../dirConfigEditApi";
import { paletteFromValue, type DirPalette } from "../dirPalette";
import {
  DIR_FORM_FIELDS,
  UNSET_COLOR_PICKER_START,
  editForInput,
  editForModelChoice,
  editForSet,
  inputText,
  type DirFormField,
} from "../dirSettingsFormFields";
import DirAddDirsEditor from "./DirAddDirsEditor.vue";
import DirHeaderSection from "./DirHeaderSection.vue";
import DirMediaSection from "./DirMediaSection.vue";
import DirModelSelect from "./DirModelSelect.vue";
import DirFormKeyActions from "./DirFormKeyActions.vue";
import DirPaletteEditor from "./DirPaletteEditor.vue";
import HeaderStatusColorsEditor from "./HeaderStatusColorsEditor.vue";

const props = defineProps<{ path: string; detail: DirConfigDetailView }>();
const emit = defineEmits<{ (e: "saved", detail: DirConfigDetailView): void }>();

const { t } = useI18n();
const { themes } = useTheme();

const saving = ref(false);
const error = ref<string | null>(null);
// Bumped after every save attempt, so each input is redrawn from `detail` — a refused value the
// browser is still showing goes back to what the file holds.
const redraw = ref(0);

const isSet = (key: DirFormKey): boolean => key in props.detail.formValues;
const isLocal = (key: DirFormKey): boolean => props.detail.source.local.includes(key);
const valueOf = (field: DirFormField): string => inputText(field, props.detail.formValues[field.key]);

function failureText(failure: DirConfigSaveFailure): string {
  if (failure.kind === "unreadable") return t("dirSettingsForm.errors.unreadable", { file: failure.file });
  if (failure.kind === "refused") return t("dirSettingsForm.errors.refused", { message: failure.message });
  return t("dirSettingsForm.errors.failed");
}

async function save(edit: DirConfigEdit): Promise<void> {
  saving.value = true;
  const result = await saveDirConfigEdit(props.path, edit);
  saving.value = false;
  error.value = result.ok ? null : failureText(result.failure);
  if (result.ok) emit("saved", result.detail);
  redraw.value += 1;
}

function onInput(field: DirFormField, e: Event): void {
  if (!(e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement)) return;
  if (e.target.value.trim() === valueOf(field)) return;
  const edit = editForInput(field, e.target.value);
  if (edit) {
    void save(edit);
    return;
  }
  error.value = t("dirSettingsForm.errors.wholeNumber");
  redraw.value += 1;
}

// The two keys edited as a whole set, read back from what the file holds.
const statusColors = computed(() => sanitizeHeaderStatusColors(props.detail.formValues.headerStatusColors));
const palette = computed(() => paletteFromValue(props.detail.formValues.colors));
const onStatusColors = (next: HeaderStatusColors) => void save(editForSet("headerStatusColors", headerStatusColorsForFile(next)));
const onPalette = (next: DirPalette) => void save(editForSet("colors", next));
const addDirs = computed(() => {
  const value = props.detail.formValues.addDirs;
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
});
const onAddDirs = (next: string[]) => void save(editForSet("addDirs", next));
const modelIsSet = computed(() => isSet("provider") || isSet("model"));
const modelIsLocal = computed(() => isLocal("provider") || isLocal("model"));

// Enter commits a text field the way leaving it does, which is what fires `change`.
function commitOnEnter(e: KeyboardEvent): void {
  if (e.target instanceof HTMLInputElement) e.target.blur();
}

const INPUT = "min-w-0 rounded border border-border bg-elevated px-1.5 py-0.5 font-mono text-[12px] text-fg disabled:opacity-60";
</script>

<template>
  <section class="mt-3 border-t border-border pt-2" data-testid="dir-settings-form">
    <p class="m-0 text-[12px] font-semibold text-fg">{{ t("dirSettingsForm.heading") }}</p>
    <p class="m-0 mb-2 text-[11px] text-dim">{{ t("dirSettingsForm.intro") }}</p>
    <p v-if="error" class="m-0 mb-2 text-[11px] text-err-text" role="alert" data-testid="dir-settings-form-error">{{ error }}</p>
    <div class="grid grid-cols-[max-content_1fr] items-center gap-x-3 gap-y-1">
      <template v-for="field in DIR_FORM_FIELDS" :key="`${field.key}-${redraw}`">
        <label :for="`dir-form-${field.key}`" class="text-[12px] text-dim">{{ t(`dirSettingsForm.fields.${field.key}`) }}</label>
        <div class="flex min-w-0 items-center gap-1.5" :data-testid="`dir-form-row-${field.key}`">
          <template v-if="field.kind === 'color'">
            <input
              :id="`dir-form-${field.key}`"
              type="color"
              class="h-6 w-8 flex-none cursor-pointer rounded border border-border bg-transparent p-0 disabled:opacity-60"
              :value="valueOf(field) || UNSET_COLOR_PICKER_START"
              :disabled="saving"
              @change="onInput(field, $event)"
            />
            <span class="font-mono text-[11px]" :class="isSet(field.key) ? 'text-fg' : 'text-dim'">{{ valueOf(field) || t("dirSettingsForm.notSet") }}</span>
          </template>
          <select
            v-else-if="field.kind === 'theme'"
            :id="`dir-form-${field.key}`"
            :class="INPUT"
            :value="valueOf(field)"
            :disabled="saving"
            @change="onInput(field, $event)"
          >
            <option value="">{{ t("dirSettingsForm.themeGlobal") }}</option>
            <option v-for="theme in themes" :key="theme.id" :value="theme.id">{{ theme.label }}</option>
          </select>
          <select
            v-else-if="field.kind === 'tint'"
            :id="`dir-form-${field.key}`"
            :class="INPUT"
            :value="valueOf(field)"
            :disabled="saving"
            @change="onInput(field, $event)"
          >
            <option value="">{{ t("dirSettingsForm.themeGlobal") }}</option>
            <option v-for="mode in HEADER_STATUS_TINTS" :key="mode" :value="mode">{{ t(`settingsControls.headerTint.tints.${mode}`) }}</option>
          </select>
          <select
            v-else-if="field.kind === 'bool'"
            :id="`dir-form-${field.key}`"
            :class="INPUT"
            :value="valueOf(field)"
            :disabled="saving"
            @change="onInput(field, $event)"
          >
            <option value="">{{ t("dirSettingsForm.themeGlobal") }}</option>
            <option value="true">{{ t("dirSettingsForm.boolOn") }}</option>
            <option value="false">{{ t("dirSettingsForm.boolOff") }}</option>
          </select>
          <input
            v-else
            :id="`dir-form-${field.key}`"
            :type="field.kind === 'number' ? 'number' : 'text'"
            :class="[INPUT, field.kind === 'number' ? 'w-20' : 'flex-auto']"
            :value="valueOf(field)"
            :placeholder="t('dirSettingsForm.notSet')"
            :disabled="saving"
            @change="onInput(field, $event)"
            @keydown.enter="commitOnEnter"
          />
          <DirFormKeyActions
            :form-key="field.key"
            :is-set="isSet(field.key)"
            :is-local="isLocal(field.key)"
            :saving="saving"
            @clear="save({ set: {}, unset: [field.key] })"
          />
        </div>
      </template>
      <label for="dir-form-model" class="text-[12px] text-dim">{{ t("dirSettingsForm.fields.model") }}</label>
      <div :key="`model-${redraw}`" class="flex min-w-0 items-center gap-1.5" data-testid="dir-form-row-model">
        <DirModelSelect :values="detail.formValues" :saving="saving" @choose="(choice) => void save(editForModelChoice(choice))" />
        <DirFormKeyActions
          form-key="model"
          :is-set="modelIsSet"
          :is-local="modelIsLocal"
          :saving="saving"
          @clear="save({ set: {}, unset: ['provider', 'model'] })"
        />
      </div>
    </div>
    <DirMediaSection :key="`media-${redraw}`" :detail="detail" :saving="saving" @save="(edit) => void save(edit)" />
    <div class="mt-2" data-testid="dir-form-row-addDirs">
      <div class="flex items-center gap-1.5">
        <span class="text-[12px] text-dim">{{ t("dirSettingsForm.fields.addDirs") }}</span>
        <DirFormKeyActions
          form-key="addDirs"
          :is-set="isSet('addDirs')"
          :is-local="isLocal('addDirs')"
          :saving="saving"
          @clear="save({ set: {}, unset: ['addDirs'] })"
        />
      </div>
      <p class="m-0 text-[11px] text-dim">{{ t("dirSettingsForm.addDirs.hint") }}</p>
      <DirAddDirsEditor :key="`add-dirs-${redraw}`" :dirs="addDirs" :saving="saving" @change="onAddDirs" />
    </div>
    <div class="mt-2" data-testid="dir-form-row-headerStatusColors">
      <div class="flex items-center gap-1.5">
        <span class="text-[12px] text-dim">{{ t("dirSettingsForm.fields.headerStatusColors") }}</span>
        <DirFormKeyActions
          form-key="headerStatusColors"
          :is-set="isSet('headerStatusColors')"
          :is-local="isLocal('headerStatusColors')"
          :saving="saving"
          @clear="save({ set: {}, unset: ['headerStatusColors'] })"
        />
      </div>
      <p class="m-0 text-[11px] text-dim">{{ t("dirSettingsForm.statusColorsHint") }}</p>
      <HeaderStatusColorsEditor :key="`status-${redraw}`" :colors="statusColors" :saving="saving" @change="onStatusColors" />
    </div>
    <div data-testid="dir-form-row-colors">
      <div class="flex items-center gap-1.5">
        <span class="text-[12px] text-dim">{{ t("dirSettingsForm.fields.colors") }}</span>
        <DirFormKeyActions
          form-key="colors"
          :is-set="isSet('colors')"
          :is-local="isLocal('colors')"
          :saving="saving"
          @clear="save({ set: {}, unset: ['colors'] })"
        />
      </div>
      <DirPaletteEditor :redraw="redraw" :palette="palette" :saving="saving" @change="onPalette" />
    </div>
    <DirHeaderSection :path="path" :detail="detail" @saved="(next) => emit('saved', next)" />
  </section>
</template>
