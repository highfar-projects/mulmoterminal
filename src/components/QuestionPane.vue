<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { AnswerFailure, AskQuestionEvent } from "../../common/askQuestion";

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
  // Why the last answer did not reach the dialog, when it did not. The buttons come back either
  // way, and coming back with no explanation is the failure mode this exists to avoid — pressing
  // them again would fail the same way, silently.
  failure?: AnswerFailure | null;
  expanded?: boolean;
}>();

// `closed` never reaches here: the pane simply goes, because the question is genuinely answered.
const FAILURE_TEXT: Record<AnswerFailure, string> = {
  closed: "That question is no longer the one on screen — it was answered or cancelled elsewhere.",
  "bad-picks": "Those choices did not fit the question. It may have changed — try again.",
  unwritable: "This terminal cannot be typed into from here. It outlived a server restart, so answer in the terminal itself.",
  partial: "Part of the answer reached the dialog before it was interrupted, so where it stands is no longer known from here. Finish it in the terminal.",
};

const emit = defineEmits<{ answer: [picks: number[][]]; say: [text: string]; close: []; toggleExpand: [] }>();

const questions = computed(() => props.event?.questions ?? []);

// A failure — any of them — turns the pane into an explanation. None can be retried from here:
// `partial` left the dialog in a state only the keyboard can resolve, `unwritable` has no PTY to
// type into, and `closed` means the dialog on screen is no longer this one. Leaving the controls
// live would offer a click that is refused, and taking that click unmounts the pane — discarding
// the sentence the user had typed along with the explanation of why it did not go.
//
// The controls come back with the next question, which clears the failure.
const answerable = computed(() => props.failure == null);

// Offered on the one shape it was measured on: a lone SINGLE-select question, where the text row's
// Enter is the whole answer. A wizard moves on to its next question instead of finishing, and a
// multi-select dialog stops at its review screen — both would leave the terminal waiting for
// something this pane cannot send. Those are answered with their buttons.
const canUseWords = computed(() => answerable.value && questions.value.length === 1 && questions.value[0]?.multiSelect !== true);

// One entry per question, holding the chosen option indexes. Kept ASCENDING: the keystrokes that
// answer the dialog only ever walk DOWN the list, so an out-of-order pick would toggle the wrong
// row (common/askQuestion.ts rejects it outright rather than sending it).
const picks = ref<number[][]>([]);

// None of the options fits. The dialog's own `Type something` row IS a text field, so these words
// go there and come back as the answer (#1693) — the same act as pressing a button, in the user's
// own words.
const other = ref("");

function sayOther(): void {
  const text = other.value.trim();
  if (text) emit("say", text);
}

watch(
  () => props.event?.toolUseId,
  () => {
    picks.value = questions.value.map(() => []);
    other.value = "";
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
        <p v-if="failure" data-testid="question-failure" class="mb-3 rounded border border-border bg-panel px-3 py-2 text-[12px]" role="alert">
          {{ FAILURE_TEXT[failure] }}
        </p>

        <div v-for="(question, qi) in answerable ? questions : []" :key="`${event.toolUseId}-${qi}`" class="mb-4">
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
          v-if="!immediate && answerable"
          type="button"
          data-testid="question-send-btn"
          class="w-full cursor-pointer rounded border border-border bg-panel px-3 py-2 font-medium text-fg disabled:cursor-not-allowed disabled:text-dim"
          :disabled="!canSubmit"
          @click="submit"
        >
          Send
        </button>

        <!-- None of the options fits. Declining is what the dialog itself offers here, so this says
             so rather than pretending the text goes into the question. -->
        <div v-if="canUseWords" class="mt-3 border-t border-border pt-3">
          <label class="mb-1 block text-[12px] text-dim" for="question-other">Answer in your own words</label>
          <textarea
            id="question-other"
            v-model="other"
            data-testid="question-other"
            rows="2"
            class="w-full resize-y rounded border border-border bg-elevated px-2 py-1.5 text-[13px] text-fg"
            placeholder="Answer in your own words"
            @keydown.enter.meta.prevent="sayOther"
          />
          <button
            type="button"
            data-testid="question-other-btn"
            class="mt-1 w-full cursor-pointer rounded border border-border bg-panel px-3 py-2 text-[13px] font-medium text-fg disabled:cursor-not-allowed disabled:text-dim"
            :disabled="other.trim().length === 0"
            @click="sayOther"
          >
            Answer with this
          </button>
          <p class="mt-1 text-[12px] text-dim">Typed into the question's own “Type something” field, so it comes back as your answer.</p>
        </div>

        <!-- Said plainly because it is the one thing about this pane that surprises people: the
             terminal dialog never went away, and answering it there is still the faster path. -->
        <p v-if="answerable" class="mt-3 text-[12px] text-dim">Answering here presses the keys in the terminal. You can still answer the dialog directly.</p>
      </template>
    </div>
  </section>
</template>
