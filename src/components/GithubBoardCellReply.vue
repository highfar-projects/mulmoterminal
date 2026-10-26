<script setup lang="ts">
// One cell's reply area in the board's detail panel (#3185): what its terminal shows now, Claude's
// question dialog as buttons when the question pane is switched on, and a line of text sent with
// Enter. The screen and the text go through /api/terminal/:sessionId — the phone's capture and
// sender — and the question through the question pane's own routes, so every write is one the host
// already makes for another client.
import { computed, onUnmounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import type { AnswerFailure, AskQuestionEvent } from "../../common/askQuestion";
import type { BoardCell } from "../../common/githubBoard";
import { isRecord } from "../../common/isRecord";
import { jsonBody } from "../jsonBody";
import { fetchWithTimeout } from "../utils/fetchWithTimeout";
import { lookUpOpenQuestion, postAnswer, postWords } from "../composables/openQuestion";
import { dialogAfterLookup, dialogWhenUntracked, replyPermitted, type DialogState } from "./boardReplyGate";
import { questionPaneEnabled } from "../composables/questionPane";
import QuestionPane from "./QuestionPane.vue";

const props = defineProps<{ cell: BoardCell }>();

const { t } = useI18n();

// After a reply, the agent needs a moment before the screen says anything new.
const SCREEN_AFTER_REPLY_MS = 1500;

const screen = ref<string | null>(null);
const screenFailed = ref(false);
const question = ref<AskQuestionEvent | null>(null);
const answerFailure = ref<AnswerFailure | null>(null);
const text = ref("");
const sending = ref(false);
// An answer to the question dialog in flight. The dialog's keys and a reply's paste are written by
// two different host paths with no queue between them, so neither may start while the other runs.
const answering = ref(false);
const replyError = ref<string | null>(null);
let screenRequest = 0;

const terminalUrl = (path: string): string => `/api/terminal/${encodeURIComponent(props.cell.session)}/${path}`;

async function loadScreen(): Promise<void> {
  const id = ++screenRequest;
  try {
    const res = await fetchWithTimeout(terminalUrl("screen"));
    const body = await jsonBody(res);
    if (id !== screenRequest) return;
    screen.value = res.ok && isRecord(body) && typeof body.screen === "string" ? body.screen : null;
    screenFailed.value = screen.value === null;
  } catch {
    if (id === screenRequest) screenFailed.value = true;
  }
}

// What is known about the cell's dialog, which is what the reply box is gated on (boardReplyGate.ts).
// The newest lookup wins, so a slow answer cannot put back a state a later one replaced.
const dialog = ref<DialogState>("none");
let questionRequest = 0;

async function loadQuestion(): Promise<void> {
  const id = ++questionRequest;
  if (!questionPaneEnabled.value) {
    question.value = null;
    dialog.value = dialogWhenUntracked(dialog.value);
    return;
  }
  dialog.value = "unknown";
  const lookup = await lookUpOpenQuestion(props.cell.session);
  if (id !== questionRequest) return;
  question.value = lookup.ok ? lookup.question : null;
  dialog.value = dialogAfterLookup(lookup);
}

// Switching the question pane on or off while the panel is open asks again, or stops tracking.
watch(questionPaneEnabled, () => {
  if (props.cell.waiting || dialog.value !== "none") void loadQuestion();
});

// What the cell is asking is read when it starts asking, and once for a cell that already is.
const refresh = (): void => {
  void loadScreen();
  void loadQuestion();
};
// A cell that has stopped waiting is asking nothing: whatever dialog it had was answered somewhere.
watch(
  () => [props.cell.session, props.cell.waiting] as const,
  ([, waiting]) => {
    if (waiting) return refresh();
    questionRequest++;
    question.value = null;
    dialog.value = "none";
  },
  { immediate: true },
);

// A send or an answer can finish after the panel closed; nothing it schedules may outlive the panel,
// and no answer still in flight may write into it.
let mounted = true;
let refreshTimer: ReturnType<typeof setTimeout> | undefined;
const refreshSoon = (): void => {
  if (!mounted) return;
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(refresh, SCREEN_AFTER_REPLY_MS);
};
onUnmounted(() => {
  mounted = false;
  clearTimeout(refreshTimer);
  screenRequest++;
  questionRequest++;
});

const replyFailure = async (res: Response): Promise<string> => {
  const body = await jsonBody(res);
  return isRecord(body) && typeof body.error === "string" ? body.error : t("githubBoard.reply.failed");
};

const canSend = computed(() => replyPermitted({ dialog: dialog.value, sending: sending.value, answering: answering.value, text: text.value }));

async function send(): Promise<void> {
  if (!canSend.value) return;
  sending.value = true;
  replyError.value = null;
  // The box stays editable while this is in flight, so only the line that was sent is cleared —
  // whatever the user typed since is theirs.
  const sent = text.value;
  try {
    const res = await fetchWithTimeout(terminalUrl("reply"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: sent }),
    });
    if (res.ok) {
      if (text.value === sent) text.value = "";
      refreshSoon();
    } else replyError.value = await replyFailure(res);
  } catch {
    replyError.value = t("githubBoard.reply.failed");
  } finally {
    sending.value = false;
  }
}

// One write at a time: refused while a reply is being typed, and holding the reply box shut while it runs.
async function whileAnswering(run: (event: AskQuestionEvent) => Promise<void>): Promise<void> {
  const event = question.value;
  if (!event || sending.value || answering.value) return;
  answering.value = true;
  try {
    await run(event);
  } finally {
    answering.value = false;
    refreshSoon();
  }
}

// After an answer the dialog may have moved on to its next question, so nothing is known until the
// refresh that follows asks again.
const answer = (picks: number[][]): Promise<void> =>
  whileAnswering(async (event) => {
    question.value = null;
    dialog.value = "unknown";
    answerFailure.value = await postAnswer(event.sessionId, event.toolUseId, picks);
    if (answerFailure.value && answerFailure.value !== "closed") question.value = event;
  });

const say = (words: string): Promise<void> =>
  whileAnswering(async (event) => {
    answerFailure.value = await postWords(event.sessionId, event.toolUseId, words);
    if (answerFailure.value) return;
    question.value = null;
    dialog.value = "unknown";
  });

const replyPlaceholder = computed(() => {
  if (dialog.value === "open") return t("githubBoard.reply.answerQuestionFirst");
  return dialog.value === "unknown" ? t("githubBoard.reply.questionUnknown") : t("githubBoard.reply.placeholder");
});
</script>

<template>
  <div data-testid="board-cell-reply" class="flex flex-col gap-1.5">
    <div class="flex items-center gap-1.5">
      <button
        type="button"
        data-testid="board-cell-screen-load"
        class="h-6 cursor-pointer rounded-md border border-border bg-base px-2 text-[11px] text-secondary hover:bg-hover hover:text-fg"
        @click="refresh"
      >
        {{ screen === null ? t("githubBoard.reply.showScreen") : t("githubBoard.reply.refreshScreen") }}
      </button>
      <span v-if="screenFailed" class="text-[11px] text-err">{{ t("githubBoard.reply.screenFailed") }}</span>
    </div>
    <pre
      v-if="screen !== null"
      data-testid="board-cell-screen"
      class="m-0 max-h-[240px] overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-deep p-2 font-mono text-[11px] leading-[1.4] text-fg"
      >{{ screen || t("githubBoard.reply.emptyScreen") }}</pre>
    <QuestionPane v-if="question" embedded :event="question" :failure="answerFailure" @answer="answer" @say="say" />
    <form class="flex items-center gap-1.5" @submit.prevent="send">
      <input
        v-model="text"
        data-testid="board-cell-reply-input"
        type="text"
        class="box-border min-w-0 flex-auto rounded-md border border-border bg-input px-2 py-1 text-[12px] text-fg focus:border-accent focus:outline-none"
        :disabled="dialog !== 'none' || answering"
        :placeholder="replyPlaceholder"
        :aria-label="t('githubBoard.reply.placeholder')"
      />
      <button
        type="submit"
        data-testid="board-cell-reply-send"
        class="h-7 flex-none cursor-pointer rounded-md border border-border bg-base px-2 text-[12px] text-secondary enabled:hover:bg-hover enabled:hover:text-fg disabled:cursor-default disabled:opacity-40"
        :disabled="!canSend"
      >
        {{ sending ? t("githubBoard.reply.sending") : t("githubBoard.reply.send") }}
      </button>
    </form>
    <p v-if="replyError" data-testid="board-cell-reply-error" class="m-0 text-[11px] text-err">{{ replyError }}</p>
    <p v-if="cell.waiting && !question" class="m-0 text-[11px] text-dim">{{ t("githubBoard.reply.keysHint") }}</p>
  </div>
</template>
