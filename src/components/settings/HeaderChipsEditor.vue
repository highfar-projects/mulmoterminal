<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import SettingsButton from "../SettingsButton.vue";
import SettingsField from "../SettingsField.vue";
import SettingsListRow from "./SettingsListRow.vue";
import { SETTINGS_LIST } from "./sectionClasses";
import { effectiveChips, isCellChipId, type ChipEntry, type ChipProblem } from "../../../common/headerChips";
import { changeHeaderChips, globalHeaderChips, type ChipAction } from "../../composables/headerChipsConfig";
import { addableBuiltins, chipRows } from "./headerChipsEditing";

// The global header chips, one change at a time against the list on disk (#2622). An unconfigured
// list shows the default set the cells draw, and the first change saves it along with that change.
const { t } = useI18n();

const CUSTOM = "custom";
const shown = computed(() => effectiveChips(globalHeaderChips.value));
const rows = computed(() => chipRows(shown.value));
const addable = computed(() => addableBuiltins(globalHeaderChips.value));

const kind = ref<string>(CUSTOM);
const label = ref("");
const text = ref("");
const when = ref("");
const saving = ref(false);
const problem = ref<ChipProblem | null>(null);
const refused = ref(false);

const chipName = (chip: ChipEntry): string => {
  if (typeof chip !== "string") return chip.label;
  return isCellChipId(chip) ? t(`headerChips.builtins.${chip}`) : chip;
};
const chipDetail = (chip: ChipEntry): string => {
  if (typeof chip === "string") return chip;
  return chip.when ? `${chip.text}  (${chip.when})` : chip.text;
};

async function apply(action: ChipAction, payload: Record<string, unknown>): Promise<boolean> {
  saving.value = true;
  const change = await changeHeaderChips(action, payload);
  saving.value = false;
  refused.value = !change.ok && change.problem === null;
  problem.value = change.ok ? null : change.problem;
  return change.ok;
}

async function add() {
  if (saving.value) return;
  const builtin = kind.value === CUSTOM ? "" : kind.value;
  if (!(await apply("add", { builtin, label: label.value, text: text.value, when: when.value }))) return;
  label.value = "";
  text.value = "";
  when.value = "";
  kind.value = CUSTOM;
}

function remove(index: number, chip: ChipEntry) {
  if (!saving.value) void apply("remove", { index, chip });
}
function move(index: number, chip: ChipEntry, delta: -1 | 1) {
  if (!saving.value) void apply("move", { index, chip, delta });
}
function reset() {
  if (!saving.value) void apply("reset", {});
}
</script>

<template>
  <p class="mb-1.5 mt-3 text-[12px] text-dim">
    <strong class="text-fg">{{ t("headerChips.title") }}</strong> (<code>chips</code>) — {{ t("headerChips.intro") }}
  </p>
  <p v-if="globalHeaderChips === null" class="mb-1.5 text-[11px] text-dim" data-testid="header-chips-default">{{ t("headerChips.defaultNote") }}</p>
  <ul v-if="shown.length" :class="SETTINGS_LIST" data-testid="settings-header-chips">
    <SettingsListRow v-for="({ chip, key }, i) in rows" :key="key" :name="chipName(chip)" :disabled="saving" @remove="remove(i, chip)">
      <span class="shrink-0 text-[12px] text-secondary">{{ chipName(chip) }}</span>
      <code class="min-w-0 flex-auto truncate font-mono text-[11px] text-dim" :data-tip="chipDetail(chip)">{{ chipDetail(chip) }}</code>
      <button
        v-for="step in [-1, 1] as const"
        :key="step"
        type="button"
        class="cursor-pointer rounded-md border-0 bg-transparent px-1 py-1 text-[14px] text-muted hover:bg-hover hover:text-fg disabled:cursor-default disabled:opacity-40"
        :disabled="saving || i + step < 0 || i + step >= shown.length"
        :data-tip="t(step < 0 ? 'headerChips.moveUp' : 'headerChips.moveDown', { name: chipName(chip) })"
        :aria-label="t(step < 0 ? 'headerChips.moveUp' : 'headerChips.moveDown', { name: chipName(chip) })"
        @click="move(i, chip, step)"
      >
        <span class="material-symbols-outlined" aria-hidden="true">{{ step < 0 ? "arrow_upward" : "arrow_downward" }}</span>
      </button>
    </SettingsListRow>
  </ul>
  <p v-else class="mb-2 text-[12px] text-dim" data-testid="header-chips-none">{{ t("headerChips.none") }}</p>
  <div class="flex flex-wrap items-center gap-2">
    <select
      v-model="kind"
      class="cursor-pointer rounded-lg border border-border bg-elevated px-2 py-1.5 text-[12px] text-fg"
      data-testid="header-chip-kind"
      :aria-label="t('headerChips.kindField')"
    >
      <option :value="CUSTOM">{{ t("headerChips.custom") }}</option>
      <option v-for="id in addable" :key="id" :value="id">{{ t(`headerChips.builtins.${id}`) }}</option>
    </select>
    <template v-if="kind === CUSTOM">
      <SettingsField
        v-model="label"
        class="min-w-0 shrink grow basis-[20%]"
        data-testid="header-chip-label"
        :placeholder="t('headerChips.labelPlaceholder')"
        :aria-label="t('headerChips.labelField')"
        spellcheck="false"
        @keydown.enter="add"
      />
      <SettingsField
        v-model="text"
        class="min-w-0 flex-auto font-mono"
        data-testid="header-chip-text"
        placeholder="${branch}"
        :aria-label="t('headerChips.textField')"
        spellcheck="false"
        @keydown.enter="add"
      />
      <SettingsField
        v-model="when"
        class="min-w-0 shrink grow basis-[20%] font-mono"
        data-testid="header-chip-when"
        placeholder="isGitRepo"
        :aria-label="t('headerChips.whenField')"
        spellcheck="false"
        @keydown.enter="add"
      />
    </template>
    <SettingsButton data-testid="header-chip-add" :disabled="saving" @click="add">{{ t("settings.common.add") }}</SettingsButton>
  </div>
  <p v-if="problem" class="mt-1 text-[11px] text-err-text" role="alert" data-testid="header-chip-problem">{{ t(`headerChips.problems.${problem}`) }}</p>
  <p v-if="refused" class="mt-1 text-[11px] text-err-text" role="alert" data-testid="header-chip-refused">
    {{ t("settingsControls.entryProblems.refused") }}
  </p>
  <p class="mb-2 mt-1 text-[11px] text-dim">{{ t("headerChips.hint", { example: "${branch}" }) }}</p>
  <div v-if="globalHeaderChips !== null" class="mb-3">
    <SettingsButton data-testid="header-chips-reset" :disabled="saving" @click="reset">{{ t("headerChips.reset") }}</SettingsButton>
  </div>
</template>
