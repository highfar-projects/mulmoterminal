<script setup lang="ts">
// A list of strings in a directory's config, one row per entry as the file writes it, and a field to
// add one (#2725, #2728): extra directories, the Skill menu's skills, the Mulmo menu's decks. The order
// can be changed where it means something, and a list of known values is offered while typing. It
// says what the list should become; the form saves it.
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { withEntryAdded, withEntryMoved, withEntryRemoved, withEntryReplaced } from "../dirStringList";

const props = defineProps<{
  items: string[];
  saving: boolean;
  // `dir-add-dirs` → `dir-add-dirs-entry-0`, `dir-add-dirs-new`, …
  testidPrefix: string;
  // The i18n namespace holding `entry`, `removeLabel`, `remove`, `placeholder`, `newEntry`, `add`.
  labels: string;
  reorderable?: boolean;
  suggestions?: string[] | undefined;
}>();
const emit = defineEmits<{ (e: "change", next: string[]): void }>();
const { t } = useI18n();

const draft = ref("");
const listId = `${props.testidPrefix}-suggestions`;

function replaceAt(index: number, e: Event): void {
  if (!(e.target instanceof HTMLInputElement) || e.target.value.trim() === props.items[index]) return;
  emit("change", withEntryReplaced(props.items, index, e.target.value));
}

function add(): void {
  const next = withEntryAdded(props.items, draft.value);
  if (next) emit("change", next);
  draft.value = "";
}

const INPUT = "min-w-0 flex-auto rounded border border-border bg-elevated px-1.5 py-0.5 font-mono text-[12px] text-fg disabled:opacity-60";
const BUTTON =
  "flex-none cursor-pointer rounded border border-border bg-elevated px-1.5 py-0.5 font-sans text-[11px] text-secondary hover:bg-hover hover:text-fg disabled:opacity-60";
</script>

<template>
  <ul class="m-0 flex list-none flex-col gap-1 p-0" :data-testid="testidPrefix">
    <li v-for="(item, index) in items" :key="`${index}-${item}`" class="flex items-center gap-1.5">
      <input
        type="text"
        :class="INPUT"
        :value="item"
        :disabled="saving"
        :aria-label="t(`${labels}.entry`, { index: index + 1 })"
        :data-testid="`${testidPrefix}-entry-${index}`"
        @change="replaceAt(index, $event)"
      />
      <template v-if="reorderable">
        <button
          v-for="step in [-1, 1] as const"
          :key="step"
          type="button"
          :class="BUTTON"
          :disabled="saving || index + step < 0 || index + step >= items.length"
          :aria-label="t(step < 0 ? 'dirSettingsForm.list.moveUp' : 'dirSettingsForm.list.moveDown', { item })"
          :data-testid="`${testidPrefix}-move-${index}-${step < 0 ? 'up' : 'down'}`"
          @click="emit('change', withEntryMoved(items, index, step))"
        >
          <span class="material-symbols-outlined text-[14px]" aria-hidden="true">{{ step < 0 ? "arrow_upward" : "arrow_downward" }}</span>
        </button>
      </template>
      <button
        type="button"
        :class="BUTTON"
        :disabled="saving"
        :data-testid="`${testidPrefix}-remove-${index}`"
        :aria-label="t(`${labels}.removeLabel`, { item })"
        @click="emit('change', withEntryRemoved(items, index))"
      >
        {{ t(`${labels}.remove`) }}
      </button>
    </li>
    <li class="flex items-center gap-1.5">
      <input
        v-model="draft"
        type="text"
        :class="INPUT"
        :placeholder="t(`${labels}.placeholder`)"
        :disabled="saving"
        :aria-label="t(`${labels}.newEntry`)"
        :list="suggestions?.length ? listId : undefined"
        :data-testid="`${testidPrefix}-new`"
        @keydown.enter="add"
      />
      <datalist v-if="suggestions?.length" :id="listId">
        <option v-for="suggestion in suggestions.filter((entry) => !items.includes(entry))" :key="suggestion" :value="suggestion" />
      </datalist>
      <button type="button" :class="BUTTON" :disabled="saving || draft.trim() === ''" :data-testid="`${testidPrefix}-add`" @click="add">
        {{ t(`${labels}.add`) }}
      </button>
    </li>
  </ul>
</template>
