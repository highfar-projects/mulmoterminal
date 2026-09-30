<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import SettingsButton from "../SettingsButton.vue";
import SettingsField from "../SettingsField.vue";
import SettingsListRow from "./SettingsListRow.vue";
import ButtonPayloadFields from "./ButtonPayloadFields.vue";
import FolderPicker from "./FolderPicker.vue";
import FolderFieldsForm from "./FolderFieldsForm.vue";
import RowIconButton from "./RowIconButton.vue";
import type { FolderFields } from "../../../common/headerButtonFolders";
import { SETTINGS_LIST } from "./sectionClasses";
import { EDITABLE_RUNS, isEditableRun, type ButtonDraft, type ButtonProblem, type EditableRun } from "../../../common/headerButtonEntries";
import type { ButtonAction, ButtonRow } from "../../composables/headerButtonsConfig";
import { useButtonsTarget } from "../../composables/headerEntriesTarget";

// The header buttons, one change at a time against the list on disk (#2622): the global ones, or —
// when a directory's Settings form provides the target (#2727) — that directory's buttons or its
// palette commands. A command, text for the agent, something to open or a named operation can be
// added here; folders are listed, removed and moved, and still written by hand or by the header skill.
const { t } = useI18n();
const listTarget = useButtonsTarget();
const rows = computed(() => listTarget.rows.value);
const isDir = listTarget.scope === "dir";
const isCommands = listTarget.list === "commands";

const run = ref<EditableRun>("shell");
const label = ref("");
const icon = ref("");
const payload = ref("");
const target = ref("url");
const when = ref("");
const saving = ref(false);
const problem = ref<ButtonProblem | null>(null);
const refused = ref(false);

async function apply(action: ButtonAction, body: Record<string, unknown>): Promise<boolean> {
  saving.value = true;
  const change = await listTarget.change(action, body);
  saving.value = false;
  refused.value = !change.ok && change.problem === null;
  problem.value = change.ok ? null : change.problem;
  return change.ok;
}

// The entry the form is changing, or null when it adds a new one.
const editing = ref<ButtonRow | null>(null);

function fill(draft: ButtonDraft | null) {
  run.value = draft?.run ?? "shell";
  label.value = draft?.label ?? "";
  icon.value = draft?.icon ?? "";
  payload.value = draft?.payload ?? "";
  target.value = draft?.target ?? "url";
  when.value = draft?.when ?? "";
}

async function submit() {
  if (saving.value) return;
  const fields = { run: run.value, label: label.value, icon: icon.value, payload: payload.value, target: target.value, when: when.value };
  const wasEditing = editing.value !== null;
  const ok = editing.value ? await apply("edit", { id: editing.value.id, ...fields }) : await apply("add", fields);
  if (!ok) return;
  editing.value = null;
  // After an add the kind stays chosen, for the next button of the same kind; an edit empties the form.
  if (wasEditing) fill(null);
  else clearValues();
}

function clearValues() {
  label.value = "";
  icon.value = "";
  payload.value = "";
  when.value = "";
}

function edit(row: ButtonRow) {
  editing.value = row;
  problem.value = null;
  fill(row.draft);
}
function cancelEdit() {
  editing.value = null;
  fill(null);
}

// The list can change under an edit — another tab, an agent, or the saved list a refusal carries. A
// button that is gone, or can no longer be shown in the form, ends the edit instead of leaving Save
// aimed at it. A button inside a folder is looked for there too.
const allRows = (rows: readonly ButtonRow[]): ButtonRow[] => rows.flatMap((row) => [row, ...(row.folder?.children ?? [])]);
watch(rows, (listed) => {
  if (editing.value === null) return;
  const current = allRows(listed ?? []).find((row) => row.id === editing.value?.id);
  if (current?.draft) editing.value = current;
  else cancelEdit();
});

function remove(id: string) {
  if (!saving.value) void apply("remove", { id });
}
function move(id: string, delta: -1 | 1) {
  if (!saving.value) void apply("move", { id, delta });
}
// Only between two entries placed by position: one with its own `order` stays where that puts it.
function movable(index: number, step: -1 | 1): boolean {
  const listed = rows.value ?? [];
  const here = listed[index];
  const there = listed[index + step];
  return here !== undefined && there !== undefined && !here.ordered && !there.ordered;
}
// Which row's folder picker, or which folder's own fields, is open.
const picking = ref<string | null>(null);
const folderEditing = ref<string | null>(null);
const folders = computed(() => (rows.value ?? []).filter((row) => row.folder !== null).map(({ id, label }) => ({ id, label })));

async function putInto(id: string, destination: Record<string, string>) {
  if (!saving.value && (await apply("into-folder", { id, ...destination }))) picking.value = null;
}
function takeOut(id: string) {
  if (!saving.value) void apply("out-of-folder", { id });
}
async function saveFolder(id: string, fields: FolderFields) {
  if (!saving.value && (await apply("folder-edit", { id, ...fields }))) folderEditing.value = null;
}

function reset() {
  if (!saving.value) void apply("reset", {});
}
function onRun(event: Event) {
  if (!(event.target instanceof HTMLSelectElement) || !isEditableRun(event.target.value)) return;
  run.value = event.target.value;
  payload.value = "";
}
</script>

<template>
  <p v-if="isDir" class="mb-1.5 mt-2 text-[11px] text-dim">{{ t(isCommands ? "headerButtons.dirCommandsIntro" : "headerButtons.dirIntro") }}</p>
  <p v-else class="mb-1.5 mt-3 text-[12px] text-dim">
    <strong class="text-fg">{{ t("headerButtons.title") }}</strong> (<code>buttons</code>) — {{ t("headerButtons.intro") }}
  </p>
  <p v-if="rows === null" class="mb-1.5 text-[11px] text-dim" data-testid="header-buttons-default">
    {{ t(isDir ? "headerButtons.dirNone" : "headerButtons.defaultNote") }}
  </p>
  <ul v-else-if="rows.length" :class="SETTINGS_LIST" data-testid="settings-header-buttons">
    <template v-for="(row, i) in rows" :key="row.id">
      <SettingsListRow :name="row.label" :disabled="saving" data-testid="header-button-row" @remove="remove(row.id)">
        <span class="shrink-0 text-[12px] text-secondary">{{ row.label }}</span>
        <span class="shrink-0 text-[11px] text-dim">{{ t(`headerButtons.kinds.${row.kind}`) }}</span>
        <code class="min-w-0 flex-auto truncate font-mono text-[11px] text-dim" :data-tip="row.detail">{{ row.detail }}</code>
        <RowIconButton
          v-if="row.draft || row.folder"
          icon="edit"
          data-testid="header-button-edit"
          :active="editing?.id === row.id || folderEditing === row.id"
          :disabled="saving"
          :label="t('headerButtons.edit', { name: row.label })"
          @click="row.folder ? (folderEditing = row.id) : edit(row)"
        />
        <RowIconButton
          v-if="!row.folder && !isCommands"
          icon="create_new_folder"
          data-testid="header-button-into-folder"
          :active="picking === row.id"
          :disabled="saving"
          :label="t('headerButtons.putInto', { name: row.label })"
          @click="picking = row.id"
        />
        <RowIconButton
          v-for="step in [-1, 1] as const"
          :key="step"
          :icon="step < 0 ? 'arrow_upward' : 'arrow_downward'"
          :disabled="saving || !movable(i, step)"
          :label="row.ordered ? t('headerButtons.ordered') : t(step < 0 ? 'headerButtons.moveUp' : 'headerButtons.moveDown', { name: row.label })"
          @click="move(row.id, step)"
        />
      </SettingsListRow>
      <li v-if="picking === row.id" class="list-none">
        <FolderPicker :name="row.label" :folders="folders" @pick="(to) => putInto(row.id, to)" @cancel="picking = null" />
      </li>
      <li v-if="row.folder && folderEditing === row.id" class="list-none">
        <FolderFieldsForm :fields="row.folder.fields" @save="(fields) => saveFolder(row.id, fields)" @cancel="folderEditing = null" />
      </li>
      <SettingsListRow
        v-for="child in row.folder?.children ?? []"
        :key="child.id"
        class="ml-6"
        :name="child.label"
        :disabled="saving"
        data-testid="header-button-child"
        @remove="remove(child.id)"
      >
        <span class="shrink-0 text-[12px] text-secondary">{{ child.label }}</span>
        <span class="shrink-0 text-[11px] text-dim">{{ t(`headerButtons.kinds.${child.kind}`) }}</span>
        <code class="min-w-0 flex-auto truncate font-mono text-[11px] text-dim" :data-tip="child.detail">{{ child.detail }}</code>
        <RowIconButton
          v-if="child.draft"
          icon="edit"
          data-testid="header-button-edit"
          :active="editing?.id === child.id"
          :disabled="saving"
          :label="t('headerButtons.edit', { name: child.label })"
          @click="edit(child)"
        />
        <RowIconButton
          icon="drive_file_move_rtl"
          data-testid="header-button-out-of-folder"
          :disabled="saving"
          :label="t('headerButtons.takeOut', { name: child.label, folder: row.label })"
          @click="takeOut(child.id)"
        />
      </SettingsListRow>
    </template>
  </ul>
  <p v-else class="mb-2 text-[12px] text-dim" data-testid="header-buttons-none">{{ t("headerButtons.none") }}</p>
  <p v-if="editing" class="mb-1 text-[11px] text-accent" data-testid="header-button-editing">{{ t("headerButtons.editing", { name: editing.label }) }}</p>
  <div class="flex flex-wrap items-center gap-2">
    <select
      class="cursor-pointer rounded-lg border border-border bg-elevated px-2 py-1.5 text-[12px] text-fg"
      data-testid="header-button-run"
      :value="run"
      :aria-label="t('headerButtons.runField')"
      @change="onRun"
    >
      <option v-for="kind in EDITABLE_RUNS" :key="kind" :value="kind">{{ t(`headerButtons.runs.${kind}`) }}</option>
    </select>
    <SettingsField
      v-model="label"
      class="min-w-0 shrink grow basis-[20%]"
      data-testid="header-button-label"
      :placeholder="t('headerButtons.labelPlaceholder')"
      :aria-label="t('headerButtons.labelField')"
      spellcheck="false"
      @keydown.enter="submit"
    />
    <SettingsField
      v-model="icon"
      class="min-w-0 shrink grow basis-[15%] font-mono"
      data-testid="header-button-icon"
      placeholder="build"
      :aria-label="t('headerButtons.iconField')"
      spellcheck="false"
      @keydown.enter="submit"
    />
  </div>
  <div class="mt-2 flex flex-wrap items-center gap-2">
    <ButtonPayloadFields v-model:target="target" v-model:payload="payload" :run="run" @submit="submit" />
    <SettingsField
      v-model="when"
      class="min-w-0 shrink grow basis-[20%] font-mono"
      data-testid="header-button-when"
      placeholder="isGitRepo"
      :aria-label="t('headerButtons.whenField')"
      spellcheck="false"
      @keydown.enter="submit"
    />
    <SettingsButton data-testid="header-button-add" :disabled="saving" @click="submit">{{
      editing ? t("headerButtons.saveEdit") : t("settings.common.add")
    }}</SettingsButton>
    <SettingsButton v-if="editing" data-testid="header-button-cancel" :disabled="saving" @click="cancelEdit">{{
      t("headerButtons.cancelEdit")
    }}</SettingsButton>
  </div>
  <p v-if="problem" class="mt-1 text-[11px] text-err-text" role="alert" data-testid="header-button-problem">{{ t(`headerButtons.problems.${problem}`) }}</p>
  <p v-if="refused" class="mt-1 text-[11px] text-err-text" role="alert" data-testid="header-button-refused">
    {{ t("settingsControls.entryProblems.refused") }}
  </p>
  <p class="mb-2 mt-1 text-[11px] text-dim">{{ t(isCommands ? "headerButtons.hintNoFolder" : "headerButtons.hint", { example: "${branch}" }) }}</p>
  <div v-if="rows !== null" class="mb-3">
    <SettingsButton data-testid="header-buttons-reset" :disabled="saving" @click="reset">{{
      t(isDir ? "dirSettingsForm.useGlobal" : "headerButtons.reset")
    }}</SettingsButton>
  </div>
</template>
