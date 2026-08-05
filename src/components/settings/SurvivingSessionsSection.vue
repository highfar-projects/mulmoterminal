<script setup lang="ts">
import { onMounted } from "vue";
import { useSurvivingSessions } from "../../composables/useSurvivingSessions";
import { useSessionStop } from "../../composables/useSessionStop";
import { relativeTime } from "../cellDisplay";
import { SECTION_HEADING, SETTINGS_LIST } from "./sectionClasses";
import type { SurvivingSession } from "../../../common/survivingSessions";

// Sessions that outlived the server, across every directory (#1478).
//
// tmux persistence is why they are here at all, and until now the app could only show one you
// happened to be looking at: the launcher's rows are per directory and per agent (#1474), so a
// project you no longer open — and a Shell session, which has no conversation to list — appeared
// nowhere and could only be ended with `tmux kill-session` by hand.
//
// Read-only apart from the stop button, and it stops ONE row at a time on purpose: a single click
// that ends many live agents is automatic cleanup wearing a button, which is a different decision
// (#1467).
const { sessions, loading, failed, reload } = useSurvivingSessions();
const { stopping, stopSession } = useSessionStop(reload);

onMounted(reload);

// The row's own words for what it is. `null` agent is the honest answer for a shell or a launcher
// command — and the case nothing else in the app lists, so it is named rather than left blank.
const describe = (s: SurvivingSession): string => s.agent ?? "shell or command";

// Through the same formatter the cells use, from an absolute moment rather than the elapsed
// seconds: one vocabulary for "how long ago" across the app, and no second rounding rule.
const MS_PER_SECOND = 1000;
const lastActive = (s: SurvivingSession): string => {
  if (s.idleSeconds === null) return "";
  const now = Date.now();
  return `last active ${relativeTime(now - s.idleSeconds * MS_PER_SECOND, now)}`;
};
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
      <span class="flex-none text-[11px] text-dim">{{ describe(s) }}</span>
      <span v-if="lastActive(s)" data-testid="surviving-idle" class="flex-none text-[11px] text-dim">{{ lastActive(s) }}</span>
      <span class="flex-auto" />
      <!-- Resumable is what makes stopping safe to offer at all: the conversation comes back. Said
           on the row that is NOT, because there the session is the only copy of its scrollback. -->
      <span v-if="!s.resumable" data-testid="surviving-only-copy" class="flex-none text-[11px] text-dim" title="Nothing on disk to resume this from">
        not resumable
      </span>
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
</template>
