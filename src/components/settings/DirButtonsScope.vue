<script setup lang="ts">
// The header button editor pointed at one directory's buttons or palette commands (#2727).
import { computed, provide } from "vue";
import { isButtonProblem } from "../../../common/headerButtonEntries";
import { buttonRowsOf, type ButtonAction } from "../../composables/headerButtonsConfig";
import { BUTTONS_TARGET } from "../../composables/headerEntriesTarget";
import type { DirConfigDetailView } from "../dirConfigDetail";
import { changeDirEntries } from "./dirHeaderEntries";
import HeaderButtonsEditor from "./HeaderButtonsEditor.vue";

const props = defineProps<{ path: string; detail: DirConfigDetailView; list: "buttons" | "commands" }>();
const emit = defineEmits<{ (e: "saved", detail: DirConfigDetailView): void }>();

const rows = computed(() => {
  const value = props.detail.formValues[props.list];
  return Array.isArray(value) ? buttonRowsOf(value) : null;
});

async function change(action: ButtonAction, payload: Record<string, unknown>) {
  const { change: result, detail } = await changeDirEntries(props.path, props.list, action, payload, isButtonProblem);
  if (detail) emit("saved", detail);
  return result;
}

provide(BUTTONS_TARGET, { scope: "dir", list: props.list, rows, change });
</script>

<template>
  <HeaderButtonsEditor />
</template>
