<script setup lang="ts">
// The lists in one directory's config (#2725, #2728): extra directories its sessions may reach, the
// skills its header's Skill menu offers and in what order, the decks its Mulmo menu adds, and the
// variables each of its working trees gets a value of its own for. Each row says what its key should
// become; the form saves it and redraws this from the answer.
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import type { DirConfigEdit, DirFormKey } from "../../../common/dirConfigForm";
import { isRecord } from "../../../common/isRecord";
import type { WorktreeEnvVar } from "../../../common/worktreeEnv";
import { fetchWithTimeout } from "../../utils/fetchWithTimeout";
import type { DirConfigDetailView } from "../dirConfigDetail";
import { editForSet } from "../dirSettingsFormFields";
import { worktreeEnvRows } from "../dirWorktreeEnv";
import DirFormKeyActions from "./DirFormKeyActions.vue";
import DirStringListEditor from "./DirStringListEditor.vue";
import DirWorktreeEnvEditor from "./DirWorktreeEnvEditor.vue";

const props = defineProps<{ path: string; detail: DirConfigDetailView; saving: boolean }>();
const emit = defineEmits<{ (e: "save", edit: DirConfigEdit): void; (e: "move", key: DirFormKey, to: "local" | "shared"): void }>();
const { t } = useI18n();

const values = computed(() => props.detail.formValues);
const isSet = (key: DirFormKey): boolean => key in values.value;
const isLocal = (key: DirFormKey): boolean => props.detail.source.local.includes(key);
const strings = (key: DirFormKey): string[] => {
  const value = values.value[key];
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
};

const worktreeEnv = computed(() => worktreeEnvRows(values.value.worktreeEnv));
const onList = (key: DirFormKey, next: string[]) => emit("save", editForSet(key, next));
const onWorktreeEnv = (next: Record<string, WorktreeEnvVar>) => emit("save", editForSet("worktreeEnv", next));

// Every skill this directory can see, unfiltered by its own list — what the Skill menu can offer.
const knownSkills = ref<string[]>([]);
onMounted(async () => {
  try {
    const res = await fetchWithTimeout(`/api/skills?cwd=${encodeURIComponent(props.path)}&unfiltered=1`);
    const body: unknown = await res.json();
    const skills = isRecord(body) && Array.isArray(body.skills) ? body.skills : [];
    knownSkills.value = skills.flatMap((skill) => (isRecord(skill) && typeof skill.slug === "string" ? [skill.slug] : []));
  } catch {
    // Suggestions only: without them the field still takes a typed slug.
  }
});

const LISTS = [
  { key: "addDirs", reorderable: false },
  { key: "skills", reorderable: true },
  { key: "decks", reorderable: false },
] as const satisfies readonly { key: DirFormKey; reorderable: boolean }[];
</script>

<template>
  <div v-for="list in LISTS" :key="list.key" class="mt-2" :data-testid="`dir-form-row-${list.key}`">
    <div class="flex items-center gap-1.5">
      <span class="text-[12px] text-dim">{{ t(`dirSettingsForm.fields.${list.key}`) }}</span>
      <DirFormKeyActions
        :form-key="list.key"
        :is-set="isSet(list.key)"
        :is-local="isLocal(list.key)"
        :saving="saving"
        @clear="emit('save', { set: {}, unset: [list.key] })"
        @move="(to) => emit('move', list.key, to)"
      />
    </div>
    <p class="m-0 text-[11px] text-dim">{{ t(`dirSettingsForm.${list.key}.hint`) }}</p>
    <DirStringListEditor
      :items="strings(list.key)"
      :saving="saving"
      :testid-prefix="list.key === 'addDirs' ? 'dir-add-dirs' : `dir-${list.key}`"
      :labels="`dirSettingsForm.${list.key}`"
      :reorderable="list.reorderable"
      :suggestions="list.key === 'skills' ? knownSkills : undefined"
      @change="(next) => onList(list.key, next)"
    />
  </div>
  <div class="mt-2" data-testid="dir-form-row-worktreeEnv">
    <div class="flex items-center gap-1.5">
      <span class="text-[12px] text-dim">{{ t("dirSettingsForm.fields.worktreeEnv") }}</span>
      <DirFormKeyActions
        form-key="worktreeEnv"
        :is-set="isSet('worktreeEnv')"
        :is-local="isLocal('worktreeEnv')"
        :saving="saving"
        @clear="emit('save', { set: {}, unset: ['worktreeEnv'] })"
        @move="(to) => emit('move', 'worktreeEnv', to)"
      />
    </div>
    <p class="m-0 text-[11px] text-dim">{{ t("dirSettingsForm.worktreeEnv.hint") }}</p>
    <DirWorktreeEnvEditor :rows="worktreeEnv" :saving="saving" @change="onWorktreeEnv" />
  </div>
</template>
