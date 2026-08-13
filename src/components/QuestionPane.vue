<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { AskQuestionEvent } from "../../common/askQuestion";

// The choices of a live AskUserQuestion dialog, as buttons (#1679).
//
// This pane does NOT replace the dialog: the terminal is still showing it, and answering there
// still works. Picking here types arrow keys and Enter into that same dialog, so whichever end
// answers first wins and neither has to know about the other.
//
// Words are hardcoded English like every other pane — vue-i18n covers the Settings modal only,
// and the app moves surface by surface (#1566).
const props = defineProps<{
  // Null when the session has no question up: the pane shows its empty state rather than unmounting,
  // so a question answered in the terminal leaves an explanation behind instead of a vanished pane.
  event: AskQuestionEvent | null;
  expanded?: boolean;
}>();

const emit = defineEmits<{ answer: [picks: number[][]]; close: []; toggleExpand: [] }>();

const questions = computed(() => props.event?.questions ?? []);

// One entry per question, holding the chosen option indexes. Kept ASCENDING: the keystrokes that
// answer the dialog only ever walk DOWN the list, so an out-of-order pick would toggle the wrong
// row (common/askQuestion.ts rejects it outright rather than sending it).
const picks = ref<number[][]>([]);

watch(
  () => props.event?.toolUseId,
  () => {
    picks.value = questions.value.map(() => []);
  },
  { immediate: true },
);

// A lone single-select question is the common shape, and there the option button IS the answer —
// a second click on a Send button would make the pane slower than the dialog it exists to beat.
const immediate = computed(() => questions.value.length === 1 && questions.value[0]?.multiSelect !== true);

const chosen = (qi: number, oi: number): boolean => picks.value[qi]?.includes(oi) === true;

const canSubmit = computed(() => questions.value.every((question, qi) => question.multiSelect || picks.value[qi]?.length === 1));

function submit(): void {
  if (!canSubmit.value) return;
  emit(
    "answer",
    picks.value.map((chosenIndexes) => [...chosenIndexes]),
  );
}

const toggled = (current: readonly number[], oi: number): number[] =>
  current.includes(oi) ? current.filter((idx) => idx !== oi) : [...current, oi].sort((a, b) => a - b);

function choose(qi: number, oi: number): void {
  const question = questions.value[qi];
  if (!question) return;
  const current = picks.value[qi] ?? [];
  const next = question.multiSelect ? toggled(current, oi) : [oi];
  picks.value = picks.value.map((entry, idx) => (idx === qi ? next : entry));
  if (immediate.value) submit();
}
</script>

<template>
  <section class="flex h-full w-[340px] shrink-0 flex-col border-l border-border bg-deep">
    <div class="flex items-center justify-between bg-panel px-4 py-2 font-sans text-[14px] text-fg">
      <span class="font-semibold">Question</span>
      <!-- Expand then close, in that order, as the Canvas and Tools headers have them: the panes
           share one slot, so the same control must sit in the same place in all of them. -->
      <div class="flex items-center gap-1">
        <button
          type="button"
          data-testid="question-expand-btn"
          class="cursor-pointer rounded border-0 bg-transparent px-1 py-0.5 text-[15px] leading-none text-dim hover:text-fg"
          :title="expanded ? 'Restore the terminal beside the question' : 'Expand the question over the terminal'"
          :aria-label="expanded ? 'Restore question pane width' : 'Expand question pane'"
          :aria-pressed="expanded === true"
          @click="emit('toggleExpand')"
        >
          <span class="material-symbols-outlined" aria-hidden="true">{{ expanded ? "close_fullscreen" : "open_in_full" }}</span>
        </button>
        <button
          type="button"
          data-testid="question-close-btn"
          class="cursor-pointer rounded border-0 bg-transparent px-1 py-0.5 text-[15px] leading-none text-dim hover:text-fg"
          title="Close question pane"
          aria-label="Close question pane"
          @click="emit('close')"
        >
          <span class="material-symbols-outlined" aria-hidden="true">close</span>
        </button>
      </div>
    </div>

    <div class="flex-1 overflow-y-auto px-4 py-3 font-sans text-[13px] text-fg">
      <p v-if="!event" class="text-dim">Nothing is being asked right now. The pane opens by itself when this session asks something.</p>

      <template v-else>
        <div v-for="(question, qi) in questions" :key="`${event.toolUseId}-${qi}`" class="mb-4">
          <div v-if="question.header" class="mb-1 text-[11px] font-semibold tracking-wide text-dim uppercase">{{ question.header }}</div>
          <div class="mb-2 leading-snug">{{ question.question }}</div>
          <div class="flex flex-col gap-1">
            <button
              v-for="(option, oi) in question.options"
              :key="oi"
              type="button"
              data-testid="question-option"
              class="cursor-pointer rounded border px-3 py-2 text-left leading-snug"
              :class="chosen(qi, oi) ? 'border-accent bg-panel text-fg' : 'border-border bg-transparent text-fg hover:bg-panel'"
              :aria-pressed="chosen(qi, oi)"
              @click="choose(qi, oi)"
            >
              <span class="font-medium">{{ option.label }}</span>
              <span v-if="option.description" class="mt-0.5 block text-[12px] text-dim">{{ option.description }}</span>
            </button>
          </div>
        </div>

        <button
          v-if="!immediate"
          type="button"
          data-testid="question-send-btn"
          class="w-full cursor-pointer rounded border border-border bg-panel px-3 py-2 font-medium text-fg disabled:cursor-not-allowed disabled:text-dim"
          :disabled="!canSubmit"
          @click="submit"
        >
          Send
        </button>

        <!-- Said plainly because it is the one thing about this pane that surprises people: the
             terminal dialog never went away, and answering it there is still the faster path. -->
        <p class="mt-3 text-[12px] text-dim">Answering here presses the keys in the terminal. You can still answer the dialog directly.</p>
      </template>
    </div>
  </section>
</template>
