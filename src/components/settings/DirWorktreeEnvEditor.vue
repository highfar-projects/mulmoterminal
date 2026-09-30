<script setup lang="ts">
// A directory's per-worktree variables (`worktreeEnv`, #2728): each named variable is a port every
// working tree gets its own of, spread upward from `base`, or a slug unique to the tree. It says what
// the declaration should become; the form saves it.
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { MAX_PORT_BASE, MIN_PORT, type WorktreeEnvVar } from "../../../common/worktreeEnv";
import { isNewVariableName, newVariable, worktreeEnvOf, type WorktreeEnvRow } from "../dirWorktreeEnv";

const props = defineProps<{ rows: WorktreeEnvRow[]; saving: boolean }>();
const emit = defineEmits<{ (e: "change", next: Record<string, WorktreeEnvVar>): void }>();
const { t } = useI18n();

const KINDS: readonly WorktreeEnvVar["kind"][] = ["port", "slug"];
const isKind = (value: string): value is WorktreeEnvVar["kind"] => KINDS.some((kind) => kind === value);

const newName = ref("");
const newKind = ref<WorktreeEnvVar["kind"]>("port");

const withRow = (index: number, variable: WorktreeEnvVar) => worktreeEnvOf(props.rows.map((row, at) => (at === index ? { ...row, variable } : row)));

function onKind(index: number, e: Event): void {
  if (e.target instanceof HTMLSelectElement && isKind(e.target.value)) emit("change", withRow(index, newVariable(e.target.value)));
}

function onValue(index: number, row: WorktreeEnvRow, e: Event): void {
  if (!(e.target instanceof HTMLInputElement)) return;
  const text = e.target.value.trim();
  if (row.variable.kind === "port") emit("change", withRow(index, { kind: "port", base: Number(text) }));
  else emit("change", withRow(index, text === "" ? { kind: "slug" } : { kind: "slug", prefix: text }));
}

function add(): void {
  const name = newName.value.trim();
  if (!isNewVariableName(name, props.rows)) return;
  emit("change", worktreeEnvOf([...props.rows, { name, variable: newVariable(newKind.value) }]));
  newName.value = "";
}

const CONTROL = "min-w-0 rounded border border-border bg-elevated px-1.5 py-0.5 text-[12px] text-fg disabled:opacity-60";
const BUTTON =
  "flex-none cursor-pointer rounded border border-border bg-elevated px-1.5 py-0.5 font-sans text-[11px] text-secondary hover:bg-hover hover:text-fg disabled:opacity-60";
</script>

<template>
  <ul class="m-0 flex list-none flex-col gap-1 p-0" data-testid="dir-worktree-env">
    <li v-for="(row, index) in rows" :key="row.name" class="flex flex-wrap items-center gap-1.5" :data-name="row.name">
      <code class="w-32 flex-none truncate font-mono text-[12px] text-fg">{{ row.name }}</code>
      <select
        :class="CONTROL"
        :value="row.variable.kind"
        :disabled="saving"
        :aria-label="t('dirSettingsForm.worktreeEnv.kind', { name: row.name })"
        @change="onKind(index, $event)"
      >
        <option v-for="kind in KINDS" :key="kind" :value="kind">{{ t(`dirSettingsForm.worktreeEnv.kinds.${kind}`) }}</option>
      </select>
      <input
        v-if="row.variable.kind === 'port'"
        type="number"
        :class="[CONTROL, 'w-24 font-mono']"
        :min="MIN_PORT"
        :max="MAX_PORT_BASE"
        :value="row.variable.base"
        :disabled="saving"
        :aria-label="t('dirSettingsForm.worktreeEnv.base', { name: row.name })"
        :data-testid="`dir-worktree-env-value-${row.name}`"
        @change="onValue(index, row, $event)"
      />
      <input
        v-else
        type="text"
        :class="[CONTROL, 'w-32 font-mono']"
        :value="row.variable.prefix ?? ''"
        :placeholder="t('dirSettingsForm.worktreeEnv.prefixPlaceholder')"
        :disabled="saving"
        :aria-label="t('dirSettingsForm.worktreeEnv.prefix', { name: row.name })"
        :data-testid="`dir-worktree-env-value-${row.name}`"
        @change="onValue(index, row, $event)"
      />
      <button
        type="button"
        :class="BUTTON"
        :disabled="saving"
        :aria-label="t('dirSettingsForm.worktreeEnv.removeLabel', { name: row.name })"
        :data-testid="`dir-worktree-env-remove-${row.name}`"
        @click="emit('change', worktreeEnvOf(rows.filter((_, at) => at !== index)))"
      >
        {{ t("dirSettingsForm.worktreeEnv.remove") }}
      </button>
    </li>
    <li class="flex flex-wrap items-center gap-1.5">
      <input
        v-model="newName"
        type="text"
        :class="[CONTROL, 'w-32 font-mono']"
        placeholder="PORT"
        :disabled="saving"
        :aria-label="t('dirSettingsForm.worktreeEnv.newName')"
        data-testid="dir-worktree-env-new-name"
        @keydown.enter="add"
      />
      <select
        v-model="newKind"
        :class="CONTROL"
        :disabled="saving"
        :aria-label="t('dirSettingsForm.worktreeEnv.newKind')"
        data-testid="dir-worktree-env-new-kind"
      >
        <option v-for="kind in KINDS" :key="kind" :value="kind">{{ t(`dirSettingsForm.worktreeEnv.kinds.${kind}`) }}</option>
      </select>
      <button type="button" :class="BUTTON" :disabled="saving || !isNewVariableName(newName.trim(), rows)" data-testid="dir-worktree-env-add" @click="add">
        {{ t("dirSettingsForm.worktreeEnv.add") }}
      </button>
    </li>
  </ul>
</template>
