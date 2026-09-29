<script setup lang="ts">
// One line of the build list: the folder, what it makes, and where it stands.
import { useI18n } from "vue-i18n";
import type { RunList } from "../../composables/blueprintsApi";
import { waitKey } from "./blueprintView";

defineProps<{ summary: RunList[number]; selected: boolean }>();
defineEmits<{ select: [] }>();
const { t } = useI18n();

const folderName = (dir: string): string => dir.split(/[\\/]/).filter(Boolean).at(-1) ?? dir;
</script>

<template>
  <button
    type="button"
    data-testid="blueprint-run-item"
    class="flex cursor-pointer flex-col gap-0.5 rounded-[4px] border-none px-2 py-1.5 text-left hover:bg-hover"
    :class="selected ? 'bg-hover' : 'bg-transparent'"
    :data-tip="summary.projectDir"
    @click="$emit('select')"
  >
    <span class="truncate font-mono text-[12px] text-fg">{{ folderName(summary.projectDir) }}</span>
    <span v-if="summary.usecaseTitle" class="truncate font-sans text-[11px] text-secondary" data-testid="blueprint-run-kind">{{ summary.usecaseTitle }}</span>
    <span class="truncate font-sans text-[11px] text-secondary">{{ summary.current ? summary.current.title : t("blueprints.done") }}</span>
    <span v-if="waitKey(summary.waitingOn)" class="font-sans text-[11px] text-warn">{{ t(waitKey(summary.waitingOn) ?? "") }}</span>
    <span v-else class="font-sans text-[11px] text-dim">{{ t("blueprints.progress", { passed: summary.passed, total: summary.total }) }}</span>
  </button>
</template>
