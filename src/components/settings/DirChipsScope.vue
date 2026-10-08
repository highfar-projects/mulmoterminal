<script setup lang="ts">
// The header chip editor pointed at one directory's chips (#2727).
import { computed, provide } from "vue";
import { isChipEntry, isChipProblem } from "../../../common/headerChips";
import type { ChipAction } from "../../composables/headerChipsConfig";
import { CHIPS_TARGET } from "../../composables/headerEntriesTarget";
import type { DirConfigDetailView } from "../dirConfigDetail";
import { changeDirEntries } from "./dirHeaderEntries";
import HeaderChipsEditor from "./HeaderChipsEditor.vue";

const props = defineProps<{ path: string; detail: DirConfigDetailView }>();
const emit = defineEmits<{ (e: "saved", detail: DirConfigDetailView): void }>();

const chips = computed(() => {
  const value = props.detail.formValues.chips;
  return Array.isArray(value) ? value.filter(isChipEntry) : null;
});

async function change(action: ChipAction, payload: Record<string, unknown>) {
  const { change: result, detail } = await changeDirEntries(props.path, "chips", action, payload, isChipProblem);
  if (detail) emit("saved", detail);
  return result;
}

provide(CHIPS_TARGET, { scope: "dir", chips, change });
</script>

<template>
  <HeaderChipsEditor />
</template>
