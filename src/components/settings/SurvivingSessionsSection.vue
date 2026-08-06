<script setup lang="ts">
import { onMounted } from "vue";
import { useSurvivingSessions } from "../../composables/useSurvivingSessions";
import { useSessionStop } from "../../composables/useSessionStop";
import { sessionIdleReapDays, saveSessionIdleReapDays } from "../../composables/sessionReap";
import { MAX_REAP_IDLE_DAYS, MIN_REAP_IDLE_DAYS, REAP_IDLE_DAYS_OFF } from "../../../common/sessionReap";
import { relativeTime } from "../cellDisplay";
import SettingsStepper from "./SettingsStepper.vue";
import { SECTION_HEADING, SETTINGS_LIST } from "./sectionClasses";
import type { SurvivingSession } from "../../../common/survivingSessions";

// Sessions that outlived the server, across every directory (#1478).
//
// tmux persistence is why they are here at all, and until now the app could only show one you
// happened to be looking at: the launcher's rows are per directory and per agent (#1474), so a
// project you no longer open — and a Shell session, which has no conversation to list — appeared
// nowhere and could only be ended with `tmux kill-session` by hand.
//
// One row at a time on purpose: a single click that ends many live agents would be the automatic
// sweep wearing a button, and the sweep already exists with a rule of its own — which this section
// also owns the number for, since it is the list that number acts on (#1467).
const { sessions, loading, failed, reload } = useSurvivingSessions();
const { stopping, stopSession } = useSessionStop(reload);

onMounted(reload);

// The row's own words for what it is. `null` covers a shell and a launcher command — the rows
// listed nowhere else, which is why it is named rather than left blank — but ALSO an agy or grok
// session that outlived its pty, which nothing can map back to a key. So it says "unknown" too
// rather than calling something a shell on no evidence; the hover carries the whole answer.
const describe = (s: SurvivingSession): string => s.agent ?? "shell or unknown";
const UNKNOWN_AGENT_TITLE = "No agent conversation is recorded under this key — a shell, a launcher command, or an agent this server cannot map back";

// Through the same formatter the cells use, from an absolute moment rather than the elapsed
// seconds: one vocabulary for "how long ago" across the app, and no second rounding rule.
const MS_PER_SECOND = 1000;
const lastActive = (s: SurvivingSession): string => {
  if (s.idleSeconds === null) return "";
  const now = Date.now();
  return `last active ${relativeTime(now - s.idleSeconds * MS_PER_SECOND, now)}`;
};

const REAP_STEP_DAYS = 1;

// Re-read after saving: `reapable` is the SERVER's answer against the old threshold, so raising it
// would otherwise leave rows saying "ends at next start" about a start that will now spare them
// (CodeRabbit on #1486).
async function nudgeIdleDays(delta: number): Promise<void> {
  if (await saveSessionIdleReapDays(sessionIdleReapDays.value + delta)) await reload();
}
</script>

<template>
  <h3 :class="SECTION_HEADING">Sessions that survived a restart</h3>
  <p class="mb-2 mt-1.5 text-[12px] text-dim">
    Terminals outlive the server, so these are still running from an earlier run. A row is listed
    <strong class="text-fg">whatever directory it belongs to</strong> — including one you no longer open, and a shell, which no other list here shows. Stopping
    a row ends that session only: a conversation with a transcript can be resumed afterwards from its own directory.
  </p>

  <p v-if="loading" class="mb-2 text-[12px] text-dim">Reading the surviving sessions…</p>
  <p v-else-if="failed" class="mb-2 text-[12px] text-dim">Could not read them — tmux may not be running.</p>
  <ul v-else-if="sessions.length" :class="SETTINGS_LIST">
    <li v-for="s in sessions" :key="s.key" data-testid="surviving-row" class="flex items-baseline gap-2 rounded-md bg-elevated px-2 py-1.5">
      <span class="truncate font-mono text-[12px] text-secondary" :title="s.cwd ?? 'this server has never seen where it runs'">{{
        s.cwd ?? "unknown directory"
      }}</span>
      <span class="flex-none text-[11px] text-dim" :title="s.agent ? '' : UNKNOWN_AGENT_TITLE">{{ describe(s) }}</span>
      <span v-if="lastActive(s)" data-testid="surviving-idle" class="flex-none text-[11px] text-dim">{{ lastActive(s) }}</span>
      <span class="flex-auto" />
      <!-- Resumable is what makes stopping safe to offer at all: the conversation comes back. Said
           on the row that is NOT, because there the session is the only copy of its scrollback. -->
      <span v-if="!s.resumable" data-testid="surviving-only-copy" class="flex-none text-[11px] text-dim" title="Nothing on disk to resume this from">
        not resumable
      </span>
      <!-- The sweep is the one thing here that acts unasked, so the rows it will take say so. -->
      <span
        v-if="s.reapable"
        data-testid="surviving-doomed"
        class="flex-none text-[11px] text-dim"
        :title="`Nothing is using it and it has been silent for ${sessionIdleReapDays} day(s) — the server ends it at its next start`"
        >ends at next start</span
      >
      <span v-if="s.attached" data-testid="surviving-open" class="flex-none text-[11px] text-amber" title="A terminal is holding it — close it there"
        >● open</span
      >
      <button
        v-else
        data-testid="surviving-stop"
        class="flex-none cursor-pointer rounded-md border-none bg-transparent px-1.5 py-1 text-[13px] hover:bg-[var(--err-hover-bg)] disabled:cursor-progress"
        :disabled="stopping === s.key"
        title="Stop this session"
        :aria-label="`Stop the session in ${s.cwd ?? 'an unknown directory'}`"
        @click="stopSession({ id: s.key, title: s.cwd ?? s.key, runningKey: s.key })"
      >
        <span class="material-symbols-outlined" aria-hidden="true">stop_circle</span>
      </button>
    </li>
  </ul>
  <p v-else class="mb-2 text-[12px] text-dim">None — nothing is running from an earlier server.</p>

  <div class="mb-3 mt-2 flex items-center gap-3">
    <SettingsStepper
      :value="sessionIdleReapDays"
      unit=" days"
      :min="MIN_REAP_IDLE_DAYS"
      :max="MAX_REAP_IDLE_DAYS"
      :step="REAP_STEP_DAYS"
      label="the idle days before a session is ended"
      @nudge="nudgeIdleDays"
    />
    <span class="text-[12px] text-dim">
      <template v-if="sessionIdleReapDays === REAP_IDLE_DAYS_OFF">
        <strong class="text-fg">Never ended automatically.</strong> They stay until you stop one here, or end it from the terminal holding it.
      </template>
      <template v-else>
        A session nothing is using — nobody attached, no output for this long — is <strong class="text-fg">ended when the server next starts</strong>. Its
        conversation is kept. Set this to 0 to never end one automatically.
      </template>
    </span>
  </div>
</template>
