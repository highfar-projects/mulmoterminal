<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import SettingsButton from "../SettingsButton.vue";
import SettingsField from "../SettingsField.vue";
import SettingsListRow from "./SettingsListRow.vue";
import ButtonPayloadFields from "./ButtonPayloadFields.vue";
import { SETTINGS_LIST } from "./sectionClasses";
import { EDITABLE_RUNS, isEditableRun, type ButtonProblem, type EditableRun } from "../../../common/headerButtonEntries";
import { changeHeaderButtons, globalHeaderButtons, type ButtonAction } from "../../composables/headerButtonsConfig";

// The global header buttons, one change at a time against the list on disk (#2622). A command, text
// for the agent, something to open or a named operation can be added here; folders are listed,
// removed and moved, and still written by hand or by the header skill.
const { t } = useI18n();

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
  const change = await changeHeaderButtons(action, body);
  saving.value = false;
  refused.value = !change.ok && change.problem === null;
  problem.value = change.ok ? null : change.problem;
  return change.ok;
}

async function add() {
  if (saving.value) return;
  if (!(await apply("add", { run: run.value, label: label.value, icon: icon.value, payload: payload.value, target: target.value, when: when.value }))) return;
  label.value = "";
  icon.value = "";
  payload.value = "";
  when.value = "";
}

function remove(id: string) {
  if (!saving.value) void apply("remove", { id });
}
function move(id: string, delta: -1 | 1) {
  if (!saving.value) void apply("move", { id, delta });
}
// Only between two entries placed by position: one with its own `order` stays where that puts it.
function movable(index: number, step: -1 | 1): boolean {
  const rows = globalHeaderButtons.value ?? [];
  const here = rows[index];
  const there = rows[index + step];
  return here !== undefined && there !== undefined && !here.ordered && !there.ordered;
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
  <p class="mb-1.5 mt-3 text-[12px] text-dim">
    <strong class="text-fg">{{ t("headerButtons.title") }}</strong> (<code>buttons</code>) — {{ t("headerButtons.intro") }}
  </p>
  <p v-if="globalHeaderButtons === null" class="mb-1.5 text-[11px] text-dim" data-testid="header-buttons-default">{{ t("headerButtons.defaultNote") }}</p>
  <ul v-else-if="globalHeaderButtons.length" :class="SETTINGS_LIST" data-testid="settings-header-buttons">
    <SettingsListRow v-for="(row, i) in globalHeaderButtons" :key="row.id" :name="row.label" :disabled="saving" @remove="remove(row.id)">
      <span class="shrink-0 text-[12px] text-secondary">{{ row.label }}</span>
      <span class="shrink-0 text-[11px] text-dim">{{ t(`headerButtons.kinds.${row.kind}`) }}</span>
      <code class="min-w-0 flex-auto truncate font-mono text-[11px] text-dim" :data-tip="row.detail">{{ row.detail }}</code>
      <button
        v-for="step in [-1, 1] as const"
        :key="step"
        type="button"
        class="cursor-pointer rounded-md border-0 bg-transparent px-1 py-1 text-[14px] text-muted hover:bg-hover hover:text-fg disabled:cursor-default disabled:opacity-40"
        :disabled="saving || !movable(i, step)"
        :data-tip="row.ordered ? t('headerButtons.ordered') : t(step < 0 ? 'headerButtons.moveUp' : 'headerButtons.moveDown', { name: row.label })"
        :aria-label="t(step < 0 ? 'headerButtons.moveUp' : 'headerButtons.moveDown', { name: row.label })"
        @click="move(row.id, step)"
      >
        <span class="material-symbols-outlined" aria-hidden="true">{{ step < 0 ? "arrow_upward" : "arrow_downward" }}</span>
      </button>
    </SettingsListRow>
  </ul>
  <p v-else class="mb-2 text-[12px] text-dim" data-testid="header-buttons-none">{{ t("headerButtons.none") }}</p>
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
      @keydown.enter="add"
    />
    <SettingsField
      v-model="icon"
      class="min-w-0 shrink grow basis-[15%] font-mono"
      data-testid="header-button-icon"
      placeholder="build"
      :aria-label="t('headerButtons.iconField')"
      spellcheck="false"
      @keydown.enter="add"
    />
  </div>
  <div class="mt-2 flex flex-wrap items-center gap-2">
    <ButtonPayloadFields v-model:target="target" v-model:payload="payload" :run="run" @submit="add" />
    <SettingsField
      v-model="when"
      class="min-w-0 shrink grow basis-[20%] font-mono"
      data-testid="header-button-when"
      placeholder="isGitRepo"
      :aria-label="t('headerButtons.whenField')"
      spellcheck="false"
      @keydown.enter="add"
    />
    <SettingsButton data-testid="header-button-add" :disabled="saving" @click="add">{{ t("settings.common.add") }}</SettingsButton>
  </div>
  <p v-if="problem" class="mt-1 text-[11px] text-err-text" role="alert" data-testid="header-button-problem">{{ t(`headerButtons.problems.${problem}`) }}</p>
  <p v-if="refused" class="mt-1 text-[11px] text-err-text" role="alert" data-testid="header-button-refused">
    {{ t("settingsControls.entryProblems.refused") }}
  </p>
  <p class="mb-2 mt-1 text-[11px] text-dim">{{ t("headerButtons.hint", { example: "${branch}" }) }}</p>
  <div v-if="globalHeaderButtons !== null" class="mb-3">
    <SettingsButton data-testid="header-buttons-reset" :disabled="saving" @click="reset">{{ t("headerButtons.reset") }}</SettingsButton>
  </div>
</template>
