<script setup lang="ts">
// The extra directories a directory's sessions may reach (`addDirs`, #2725): one row per entry as the
// file writes it — relative to the directory or absolute — and a field to add one. It says what the
// list should become; the form saves it.
import { ref } from "vue";
import { useI18n } from "vue-i18n";

const props = defineProps<{ dirs: string[]; saving: boolean }>();
const emit = defineEmits<{ (e: "change", next: string[]): void }>();
const { t } = useI18n();

const draft = ref("");

function replaceAt(index: number, e: Event): void {
  if (!(e.target instanceof HTMLInputElement)) return;
  const text = e.target.value.trim();
  if (text === props.dirs[index]) return;
  emit("change", text === "" ? props.dirs.filter((_, at) => at !== index) : props.dirs.map((dir, at) => (at === index ? text : dir)));
}

function add(): void {
  const text = draft.value.trim();
  if (text === "") return;
  emit("change", [...props.dirs, text]);
  draft.value = "";
}

const INPUT = "min-w-0 flex-auto rounded border border-border bg-elevated px-1.5 py-0.5 font-mono text-[12px] text-fg disabled:opacity-60";
const BUTTON =
  "flex-none cursor-pointer rounded border border-border bg-elevated px-1.5 py-0.5 font-sans text-[11px] text-secondary hover:bg-hover hover:text-fg disabled:opacity-60";
</script>

<template>
  <ul class="m-0 flex list-none flex-col gap-1 p-0" data-testid="dir-add-dirs">
    <li v-for="(dir, index) in dirs" :key="`${index}-${dir}`" class="flex items-center gap-1.5">
      <input
        type="text"
        :class="INPUT"
        :value="dir"
        :disabled="saving"
        :aria-label="t('dirSettingsForm.addDirs.entry', { index: index + 1 })"
        :data-testid="`dir-add-dirs-entry-${index}`"
        @change="replaceAt(index, $event)"
      />
      <button
        type="button"
        :class="BUTTON"
        :disabled="saving"
        :data-testid="`dir-add-dirs-remove-${index}`"
        :aria-label="t('dirSettingsForm.addDirs.removeLabel', { dir })"
        @click="
          emit(
            'change',
            dirs.filter((_, at) => at !== index),
          )
        "
      >
        {{ t("dirSettingsForm.addDirs.remove") }}
      </button>
    </li>
    <li class="flex items-center gap-1.5">
      <input
        v-model="draft"
        type="text"
        :class="INPUT"
        :placeholder="t('dirSettingsForm.addDirs.placeholder')"
        :disabled="saving"
        :aria-label="t('dirSettingsForm.addDirs.newEntry')"
        data-testid="dir-add-dirs-new"
        @keydown.enter="add"
      />
      <button type="button" :class="BUTTON" :disabled="saving || draft.trim() === ''" data-testid="dir-add-dirs-add" @click="add">
        {{ t("dirSettingsForm.addDirs.add") }}
      </button>
    </li>
  </ul>
</template>
