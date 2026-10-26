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
import { fetchOpenQuestion, postAnswer, postWords } from "../composables/openQuestion";
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

async function loadQuestion(): Promise<void> {
  question.value = questionPaneEnabled.value ? await fetchOpenQuestion(props.cell.session) : null;
}

// What the cell is asking is read when it starts asking, and once for a cell that already is.
const refresh = (): void => {
  void loadScreen();
  void loadQuestion();
};
watch(
  () => [props.cell.session, props.cell.waiting] as const,
  ([, waiting]) => {
    if (waiting) refresh();
  },
  { immediate: true },
);

let refreshTimer: ReturnType<typeof setTimeout> | undefined;
const refreshSoon = (): void => {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(refresh, SCREEN_AFTER_REPLY_MS);
};
onUnmounted(() => clearTimeout(refreshTimer));

const replyFailure = async (res: Response): Promise<string> => {
  const body = await jsonBody(res);
  return isRecord(body) && typeof body.error === "string" ? body.error : t("githubBoard.reply.failed");
};

async function send(): Promise<void> {
  if (sending.value || text.value.trim() === "") return;
  sending.value = true;
  replyError.value = null;
  try {
    const res = await fetchWithTimeout(terminalUrl("reply"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: text.value }),
    });
    if (res.ok) {
      text.value = "";
      refreshSoon();
    } else replyError.value = await replyFailure(res);
  } catch {
    replyError.value = t("githubBoard.reply.failed");
  } finally {
    sending.value = false;
  }
}

async function answer(picks: number[][]): Promise<void> {
  const event = question.value;
  if (!event) return;
  question.value = null;
  answerFailure.value = await postAnswer(event.sessionId, event.toolUseId, picks);
  if (answerFailure.value && answerFailure.value !== "closed") question.value = event;
  refreshSoon();
}

async function say(words: string): Promise<void> {
  const event = question.value;
  if (!event) return;
  answerFailure.value = await postWords(event.sessionId, event.toolUseId, words);
  if (!answerFailure.value) question.value = null;
  refreshSoon();
}

const canSend = computed(() => !sending.value && text.value.trim() !== "");
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
        :placeholder="t('githubBoard.reply.placeholder')"
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
