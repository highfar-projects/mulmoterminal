<script setup lang="ts">
// Picking who sits at a round table, and how long it may run (#1456).
//
// Its own component rather than more markup in TerminalCell: the cell's handoff menu offers ONE
// action per target (bring that turn here / exchange with it), and a table is the opposite shape —
// several targets chosen together before anything happens. Keeping the multi-select here also
// keeps TerminalCell, already the largest component in the app, from growing a second menu.
//
// The picker is the whole admission control for this feature. Agents cannot see each other, join
// anything, or start a table; a human ticks the seats and presses the button. That is why the
// runner needs no MCP tool at all (see useRoundTable).
import { computed, ref } from "vue";
import type { HandoffTarget } from "../composables/useHandoff";
import { DEFAULT_TURN_BUDGET, MAX_MEMBERS, TURN_BUDGETS, canRunTable } from "../composables/roundTableRules";

const props = defineProps<{
  /** The other readable cells, exactly as the handoff menu lists them. */
  targets: readonly HandoffTarget[];
  /** How this cell is named at the table it starts. */
  selfLabel: string;
  /** A table started from THIS cell is running — the picker offers Stop rather than Start. */
  running: boolean;
  /** SOME automation is running (this table, or the one-turn exchange beside it). Only one may
   *  type into terminals at a time, so Start is refused — but the button stays a Start, because
   *  stopping is the other control's job. */
  busy: boolean;
}>();

const emit = defineEmits<{
  start: [targets: HandoffTarget[], budget: number];
  stop: [];
}>();

const picked = ref<string[]>([]);
const budget = ref<number>(DEFAULT_TURN_BUDGET);

const isPicked = (key: string): boolean => picked.value.includes(key);

// The cap counts the starting cell, which is always a seat — so the user may tick one fewer than
// the table holds. Ticking past it is refused here rather than trimmed at the start: a seat that
// silently did not join is worse than a checkbox that will not tick.
const full = computed(() => picked.value.length + 1 >= MAX_MEMBERS);

function toggle(key: string): void {
  if (isPicked(key)) picked.value = picked.value.filter((k) => k !== key);
  else if (!full.value) picked.value = [...picked.value, key];
}

const seats = computed(() => picked.value.length + 1);
const ready = computed(() => !props.busy && canRunTable(seats.value));

function start(): void {
  const chosen = props.targets.filter((target) => isPicked(target.key));
  if (chosen.length) emit("start", [...chosen], budget.value);
}
</script>

<template>
  <div data-testid="round-table" class="mt-1 flex flex-col gap-1 border-t border-border pt-1">
    <p class="m-0 px-2 py-0.5 font-sans text-[11px] uppercase tracking-[0.04em] text-dim">Round table</p>

    <label
      v-for="target in targets"
      :key="target.key"
      class="flex cursor-pointer items-center gap-1.5 rounded-[4px] px-2 py-1 font-sans text-[12px] text-secondary hover:bg-hover hover:text-fg"
      :class="{ 'cursor-default opacity-40': busy || (full && !isPicked(target.key)) }"
    >
      <input
        type="checkbox"
        data-testid="round-table-seat"
        class="m-0 cursor-pointer"
        :value="target.key"
        :checked="isPicked(target.key)"
        :disabled="busy || (full && !isPicked(target.key))"
        @change="toggle(target.key)"
      />
      {{ target.label }}
    </label>

    <label class="flex items-center gap-1.5 px-2 py-1 font-sans text-[12px] text-secondary">
      turns
      <select
        v-model.number="budget"
        data-testid="round-table-budget"
        :disabled="busy"
        class="cursor-pointer rounded-[4px] border border-border bg-panel px-1 py-0.5 text-[12px] text-fg"
      >
        <option v-for="option in TURN_BUDGETS" :key="option" :value="option">{{ option }}</option>
      </select>
      <!-- Every turn is a real agent turn on a real account, so the count is a cost as much as a
           runaway guard. Saying so beside the number is cheaper than finding out afterwards. -->
      <span class="text-dim">· {{ seats }} seats, one turn each in order</span>
    </label>

    <button
      v-if="!running"
      type="button"
      data-testid="round-table-start"
      class="mx-1 mb-1 cursor-pointer rounded-[4px] border border-border bg-transparent px-2 py-1 font-sans text-[12px] text-secondary hover:bg-hover hover:text-fg disabled:cursor-default disabled:opacity-40"
      :disabled="!ready"
      :title="busy ? 'Another automation is running in this cell' : ready ? `Start a table of ${seats}, ${budget} turns` : 'Pick at least one other terminal'"
      @click="start"
    >
      <span class="material-symbols-outlined align-middle" aria-hidden="true">groups</span>
      Start · {{ selfLabel }} first
    </button>
    <button
      v-else
      type="button"
      data-testid="round-table-stop"
      class="mx-1 mb-1 cursor-pointer rounded-[4px] border border-border bg-transparent px-2 py-1 font-sans text-[12px] text-secondary hover:bg-hover hover:text-fg"
      @click="emit('stop')"
    >
      <span class="material-symbols-outlined align-middle" aria-hidden="true">groups</span>
      running — stop
    </button>
  </div>
</template>
