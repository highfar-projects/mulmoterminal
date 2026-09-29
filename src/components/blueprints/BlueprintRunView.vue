<script setup lang="ts">
// One build: every step with where it stands, and — for the step it is on — the one thing the person
// can do there. Approving, answering and retrying are the only moves the executor waits for; while
// an agent is working this only says so.
import { computed, onUnmounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { loadReport, loadRun, sendEvent, type PersonEvent, type ReportView } from "../../composables/blueprintsApi";
import { currentStep } from "../../../common/blueprint/state";
import type { BlueprintRunView } from "../../../common/blueprint/run";
import type { PlanStep } from "../../../common/blueprint/plan";
import { elapsedParts, gateKey, roundNumber, stepLook } from "./blueprintView";
import { latestOnly } from "./latestOnly";
import { failureText } from "./refusalText";
import { checkOutputText, stopReasonText, untrustedFolder } from "./stepNoticeText";
import BlueprintLiveActivity from "./BlueprintLiveActivity.vue";
import BlueprintSpecReview from "./BlueprintSpecReview.vue";
import BlueprintChangedFiles from "./BlueprintChangedFiles.vue";
import BlueprintNextSteps from "./BlueprintNextSteps.vue";
import { filesGotoFile } from "../../composables/useFilesView";
import { openTerminalAt } from "../../composables/useNewTerminal";
import MarkdownProse from "../MarkdownProse.vue";

const props = defineProps<{ runId: string }>();
const { t } = useI18n();

// Fast enough that an approval visibly moves the build on; a step takes minutes, not seconds.
const RUN_POLL_MS = 2000;

const view = ref<BlueprintRunView | null>(null);
const loadError = ref<string | null>(null);
const actionError = ref<string | null>(null);
const sending = ref(false);
const answer = ref("");
const rejectReason = ref("");
// Polls and a person's actions share one sequence, so a poll sent before an action cannot land after it.
const reads = latestOnly();

const current = computed(() => (view.value ? currentStep(view.value.run.steps, view.value.state) : null));
const currentState = computed(() => (view.value && current.value ? view.value.state.steps[current.value.id] : undefined));
// Only a person can trust a folder; the step says where, and a terminal opened there asks them.
const trustFolder = computed(() => untrustedFolder(currentState.value));
const reviewing = computed(() => current.value?.gates.includes("review") ?? false);
// What the build produced is written up in the usecase's report; once every step is done it is shown here,
// because it sits in the hidden .blueprint/ folder a person would not open.
const finished = computed(() => view.value !== null && current.value === null);
const report = ref<ReportView | null>(null);
watch(
  finished,
  async (done) => {
    if (!done || report.value !== null) return;
    const result = await loadReport(props.runId);
    if (result.ok) report.value = result.value;
  },
  { immediate: true },
);

// The session working on the step right now, if one is: what the live panel and the clock follow.
const activeSession = computed(() => {
  const run = view.value?.run;
  if (!run?.activeSessionId) return null;
  return [...run.sessions].reverse().find((entry) => entry.sessionId === run.activeSessionId) ?? null;
});

// Ticks once a second so the elapsed time moves between polls.
const CLOCK_TICK_MS = 1000;
const now = ref(Date.now());
const clockTimer = setInterval(() => (now.value = Date.now()), CLOCK_TICK_MS);
onUnmounted(() => clearInterval(clockTimer));
const elapsed = computed(() => (activeSession.value ? elapsedParts(activeSession.value.atMs, now.value) : null));

async function refresh(): Promise<void> {
  // The server does not queue reads behind a person's action, so a read sent mid-action can see
  // the state from before it — and, being newer, would win. The action's own answer is the read.
  if (sending.value) return;
  const ticket = reads.take();
  const result = await loadRun(props.runId);
  if (!reads.isLatest(ticket)) return;
  if (result.ok) {
    view.value = result.value;
    loadError.value = null;
  } else loadError.value = failureText(t, result);
}

void refresh();
const pollTimer = setInterval(() => void refresh(), RUN_POLL_MS);
onUnmounted(() => clearInterval(pollTimer));

async function act(event: PersonEvent): Promise<void> {
  const step = current.value;
  if (!step || sending.value) return;
  sending.value = true;
  const ticket = reads.take();
  const result = await sendEvent(props.runId, step.id, event);
  sending.value = false;
  actionError.value = result.ok ? null : failureText(t, result);
  if (!result.ok) return;
  answer.value = "";
  rejectReason.value = "";
  // A poll sent after this action knows at least as much; only an older answer is dropped.
  if (reads.isLatest(ticket)) view.value = result.value;
}

const statusOf = (stepId: string) => view.value?.state.steps[stepId]?.status ?? "pending";
const roundOf = (step: Pick<PlanStep, "id" | "repeatWhile">) => roundNumber(step, view.value?.state.steps[step.id]);
</script>

<template>
  <div class="flex flex-col gap-5 p-5" data-testid="blueprint-run">
    <p v-if="loadError && !view" class="m-0 font-sans text-[13px] text-err-text">{{ t("blueprints.loadError") }} {{ loadError }}</p>

    <template v-if="view">
      <p class="m-0 font-sans text-[12px] text-dim">
        {{ t("blueprints.run.projectDir") }}: <span class="font-mono text-secondary">{{ view.run.projectDir }}</span>
      </p>

      <section v-if="current" class="flex max-w-[1280px] flex-col gap-3 rounded-md border border-border bg-panel p-4" data-testid="blueprint-current">
        <h2 class="m-0 flex items-center gap-2 font-sans text-[15px] font-[650] text-fg">
          <span
            class="material-symbols-outlined text-[18px]"
            :class="[stepLook(statusOf(current.id)).tone, stepLook(statusOf(current.id)).motion]"
            aria-hidden="true"
            >{{ stepLook(statusOf(current.id)).icon }}</span
          >
          {{ current.title }}
          <span v-if="roundOf(current)" class="font-sans text-[12px] font-normal text-secondary" data-testid="blueprint-round">{{
            t("blueprints.run.round", { round: roundOf(current) })
          }}</span>
          <span class="font-sans text-[12px] font-normal text-secondary">{{ t(stepLook(statusOf(current.id)).labelKey) }}</span>
          <span v-if="elapsed" class="font-sans text-[12px] font-normal text-dim" data-testid="blueprint-elapsed">{{
            t("blueprints.run.elapsed", { minutes: elapsed.minutes, seconds: elapsed.seconds })
          }}</span>
        </h2>
        <p v-if="current.description" class="m-0 font-sans text-[13px] text-secondary">{{ current.description }}</p>

        <template v-if="currentState?.status === 'awaiting-approval'">
          <ul class="m-0 flex flex-col gap-1 pl-5 font-sans text-[13px] text-fg">
            <li v-for="gate in current.gates" :key="gate">{{ t(gateKey(gate), { step: current.title }) }}</li>
          </ul>
          <div v-if="current.reads.length" class="flex flex-col gap-1.5" data-testid="blueprint-reads">
            <p class="m-0 font-sans text-[12px] text-secondary">{{ t("blueprints.run.readFirst") }}</p>
            <div class="flex flex-wrap gap-1.5">
              <button
                v-for="file in current.reads"
                :key="file"
                type="button"
                data-testid="blueprint-read-file"
                class="flex cursor-pointer items-center gap-1.5 rounded-[4px] border border-border bg-base px-2.5 py-1 font-mono text-[12px] text-fg hover:bg-hover"
                @click="filesGotoFile(view.run.projectDir, file)"
              >
                <span class="material-symbols-outlined text-[15px]" aria-hidden="true">description</span>{{ file }}
              </button>
            </div>
          </div>
          <BlueprintSpecReview
            v-if="reviewing"
            :run-id="runId"
            :revision-session-id="view.run.revisionSessionId"
            :chat-count="view.run.specChat.length"
            :project-dir="view.run.projectDir"
            :expects-spec="current.reads.length === 0"
            @sent="refresh"
          />
          <div class="flex flex-wrap items-center gap-2">
            <button
              type="button"
              data-testid="blueprint-approve"
              class="cursor-pointer rounded-[4px] border-none bg-accent px-4 py-1.5 font-sans text-[13px] text-on-accent disabled:opacity-40"
              :disabled="sending || view.run.revisionSessionId !== null"
              @click="act({ type: 'approve' })"
            >
              {{ t("blueprints.run.approve") }}
            </button>
            <input
              v-model="rejectReason"
              data-testid="blueprint-reject-reason"
              :placeholder="t('blueprints.run.rejectReason')"
              class="min-w-[260px] flex-1 rounded-[4px] border border-border bg-input px-2 py-1.5 font-sans text-[12px] text-fg"
            />
            <button
              type="button"
              data-testid="blueprint-reject"
              class="cursor-pointer rounded-[4px] border border-border bg-base px-3 py-1.5 font-sans text-[12px] text-secondary hover:bg-hover disabled:opacity-40"
              :disabled="sending || !rejectReason.trim()"
              @click="act({ type: 'reject', reason: rejectReason.trim() })"
            >
              {{ t("blueprints.run.reject") }}
            </button>
          </div>
        </template>

        <form
          v-else-if="currentState?.status === 'awaiting-answer'"
          class="flex flex-col gap-2"
          @submit.prevent="act({ type: 'answer', answer: answer.trim() })"
        >
          <!-- Markdown: a question that walks a person through a console carries numbered steps and links. -->
          <div class="font-sans text-[13px] text-fg" data-testid="blueprint-question-text">
            <MarkdownProse :markdown="currentState.question ?? ''" />
          </div>
          <textarea
            v-model="answer"
            data-testid="blueprint-answer"
            rows="3"
            :placeholder="t('blueprints.run.answerPlaceholder')"
            :aria-label="t('blueprints.run.answer')"
            class="rounded-[4px] border border-border bg-input px-2 py-1.5 font-sans text-[13px] text-fg"
          ></textarea>
          <div>
            <button
              type="submit"
              data-testid="blueprint-send-answer"
              class="cursor-pointer rounded-[4px] border-none bg-accent px-4 py-1.5 font-sans text-[13px] text-on-accent disabled:opacity-40"
              :disabled="sending || !answer.trim()"
            >
              {{ t("blueprints.run.send") }}
            </button>
          </div>
        </form>

        <template v-else-if="currentState?.status === 'failed'">
          <p v-if="stopReasonText(t, currentState)" data-testid="blueprint-stop-reason" class="m-0 font-sans text-[13px] text-err-text">
            {{ stopReasonText(t, currentState) }}
          </p>
          <details v-if="currentState.lastCheck && !currentState.lastCheck.ok" open class="font-sans text-[12px] text-secondary">
            <summary class="cursor-pointer">{{ t("blueprints.run.checkOutput") }}</summary>
            <pre
              data-testid="blueprint-check-output"
              class="m-0 mt-2 max-h-[320px] overflow-auto rounded-[4px] bg-base p-2 font-mono text-[11px] whitespace-pre-wrap text-fg"
              >{{ checkOutputText(t, currentState.lastCheck) }}</pre>
          </details>
          <div v-if="trustFolder" class="flex flex-col items-start gap-1" data-testid="blueprint-run-trust">
            <button
              type="button"
              data-testid="blueprint-run-open-trust"
              class="flex cursor-pointer items-center gap-1.5 rounded-[4px] border border-border bg-base px-3 py-1.5 font-sans text-[13px] text-fg hover:bg-hover"
              @click="openTerminalAt(trustFolder, null, 'claude')"
            >
              <span class="material-symbols-outlined text-[16px]" aria-hidden="true">terminal</span>
              {{ t("blueprints.run.openToTrust") }}
            </button>
            <p class="m-0 font-sans text-[11px] text-dim">{{ t("blueprints.run.openToTrustHint", { dir: trustFolder }) }}</p>
          </div>
          <div>
            <button
              type="button"
              data-testid="blueprint-retry"
              class="cursor-pointer rounded-[4px] border border-border bg-base px-4 py-1.5 font-sans text-[13px] text-fg hover:bg-hover disabled:opacity-40"
              :disabled="sending"
              @click="act({ type: 'retry' })"
            >
              {{ t("blueprints.run.retry") }}
            </button>
          </div>
        </template>

        <template v-else>
          <p class="m-0 font-sans text-[13px] text-secondary">{{ t("blueprints.run.working") }}</p>
          <BlueprintLiveActivity v-if="activeSession" :key="activeSession.sessionId" :session-id="activeSession.sessionId" />
        </template>

        <p v-if="actionError" data-testid="blueprint-action-error" class="m-0 font-sans text-[12px] text-err-text">{{ actionError }}</p>
      </section>

      <p v-else class="m-0 font-sans text-[14px] text-ok" data-testid="blueprint-finished">{{ t("blueprints.run.finished") }}</p>

      <BlueprintNextSteps v-if="finished && report?.pair" :pair="report.pair" :project-dir="view.run.projectDir" :answers="view.run.answers" />

      <BlueprintChangedFiles v-if="finished && report" :project-dir="view.run.projectDir" :files="report.changed.files" :more="report.changed.more" />

      <section v-if="finished && report?.markdown" class="flex flex-col gap-2" data-testid="blueprint-report">
        <h3 class="m-0 font-sans text-[13px] font-[650] text-fg">{{ t("blueprints.run.report") }}</h3>
        <p class="m-0 font-sans text-[12px] text-secondary">{{ t("blueprints.run.reportFile", { path: report.path }) }}</p>
        <div class="max-h-[70vh] overflow-y-auto rounded-md border border-border bg-base p-4 font-sans text-[13px] text-fg" data-testid="blueprint-report-body">
          <MarkdownProse :markdown="report.markdown" />
        </div>
      </section>

      <section class="flex flex-col gap-1">
        <h3 class="m-0 mb-1 font-sans text-[13px] font-[650] text-fg">{{ t("blueprints.run.steps") }}</h3>
        <ol class="m-0 flex list-none flex-col gap-0.5 p-0">
          <li
            v-for="step in view.run.steps"
            :key="step.id"
            data-testid="blueprint-step"
            class="flex items-center gap-2 rounded-[4px] px-2 py-1 font-sans text-[13px]"
            :class="current?.id === step.id ? 'bg-hover text-fg' : 'text-secondary'"
          >
            <span
              class="material-symbols-outlined text-[16px]"
              :class="[stepLook(statusOf(step.id)).tone, stepLook(statusOf(step.id)).motion]"
              aria-hidden="true"
              >{{ stepLook(statusOf(step.id)).icon }}</span
            >
            <span class="flex-1 truncate">{{ step.title }}</span>
            <span v-if="roundOf(step)" class="text-[11px] text-dim">{{ t("blueprints.run.round", { round: roundOf(step) }) }}</span>
            <span v-if="step.gates.length" class="material-symbols-outlined text-[14px] text-dim" aria-hidden="true">front_hand</span>
            <span class="text-[11px] text-dim">{{ t(stepLook(statusOf(step.id)).labelKey) }}</span>
          </li>
        </ol>
      </section>
    </template>
  </div>
</template>
