<script setup lang="ts">
// The Settings form for one directory's config (#2722): one row per key it edits, each saved on its
// own as soon as the change is final. The server answers with the directory's detail as it now is,
// and the form is always drawn from that — never from what it sent — so a value the server wrote
// somewhere unexpected, or refused, is what the row shows next.
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { useTheme } from "../../composables/useTheme";
import type { DirConfigEdit } from "../../../common/dirConfigForm";
import type { DirConfigDetailView } from "../dirConfigDetail";
import { saveDirConfigEdit, type DirConfigSaveFailure } from "../dirConfigEditApi";
import { DIR_FORM_FIELDS, UNSET_COLOR_PICKER_START, editForInput, inputText, type DirFormField } from "../dirSettingsFormFields";

const props = defineProps<{ path: string; detail: DirConfigDetailView }>();
const emit = defineEmits<{ (e: "saved", detail: DirConfigDetailView): void }>();

const { t } = useI18n();
const { themes } = useTheme();

const saving = ref(false);
const error = ref<string | null>(null);
// Bumped after every save attempt, so each input is redrawn from `detail` — a refused value the
// browser is still showing goes back to what the file holds.
const redraw = ref(0);

const isSet = (field: DirFormField): boolean => field.key in props.detail.formValues;
const isLocal = (field: DirFormField): boolean => props.detail.source.local.includes(field.key);
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

// Enter commits a text field the way leaving it does, which is what fires `change`.
function commitOnEnter(e: KeyboardEvent): void {
  if (e.target instanceof HTMLInputElement) e.target.blur();
}

const INPUT = "min-w-0 rounded border border-border bg-elevated px-1.5 py-0.5 font-mono text-[12px] text-fg disabled:opacity-60";
const CLEAR_BUTTON =
  "flex-none cursor-pointer rounded border border-border bg-elevated px-1.5 py-0.5 font-sans text-[11px] text-secondary hover:bg-hover hover:text-fg disabled:opacity-60";
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
            <span class="font-mono text-[11px]" :class="isSet(field) ? 'text-fg' : 'text-dim'">{{ valueOf(field) || t("dirSettingsForm.notSet") }}</span>
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
          <span v-if="isLocal(field)" class="flex-none text-[10px] text-dim">{{ t("dirSettingsForm.local") }}</span>
          <button
            v-if="isSet(field)"
            type="button"
            :class="CLEAR_BUTTON"
            :disabled="saving"
            :data-tip="t('dirSettingsForm.useGlobalTip')"
            :data-testid="`dir-form-clear-${field.key}`"
            @click="save({ set: {}, unset: [field.key] })"
          >
            {{ t("dirSettingsForm.useGlobal") }}
          </button>
        </div>
      </template>
    </div>
  </section>
</template>
