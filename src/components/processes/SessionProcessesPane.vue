<script setup lang="ts">
// Each running session and the process tree under its panes (#2219). Read only while this pane is
// mounted — every few seconds, one `ps` and one tmux listing on the server — so a closed page costs
// nothing. CPU is measured between reads, so it is blank until the second one.
import { onBeforeUnmount, onMounted, ref, shallowRef } from "vue";
import { useI18n } from "vue-i18n";
import { killProcess, loadSessionProcesses } from "../../composables/processesApi";
import { isHot, isLongRunning, isPaneRoot, type SessionProcess, type SessionProcesses } from "../../../common/sessionProcesses";
import { formatCpu, formatElapsed, formatMemory } from "./processFormat";

const { t } = useI18n();

const POLL_INTERVAL_MS = 3_000;

const sessions = shallowRef<SessionProcesses[] | null>(null);
const loadFailed = ref(false);
const now = ref(Date.now());
const ending = ref<number | null>(null);
const killError = ref<string | null>(null);
let timer: ReturnType<typeof setInterval> | null = null;
let reading = false;

async function refresh(): Promise<void> {
  if (reading) return;
  reading = true;
  const read = await loadSessionProcesses();
  reading = false;
  now.value = Date.now();
  loadFailed.value = read === null;
  if (read !== null) sessions.value = read;
}

async function end(process: SessionProcess): Promise<void> {
  if (ending.value !== null) return;
  if (!window.confirm(t("processesView.killConfirm", { command: process.command, pid: process.pid }))) return;
  ending.value = process.pid;
  killError.value = null;
  const ok = await killProcess(process);
  ending.value = null;
  if (!ok) killError.value = t("processesView.killFailed", { pid: process.pid });
  await refresh();
}

onMounted(() => {
  void refresh();
  timer = setInterval(() => void refresh(), POLL_INTERVAL_MS);
});
onBeforeUnmount(() => {
  if (timer !== null) clearInterval(timer);
});

const rowTone = (process: SessionProcess): string => (isHot(process) ? "text-err-text" : "text-fg");
</script>

<template>
  <div class="min-h-0 flex-1 overflow-y-auto p-4">
    <p v-if="killError" data-testid="processes-kill-error" class="m-0 mb-3 font-sans text-[13px] text-err-text">{{ killError }}</p>
    <p v-if="loadFailed && !sessions" class="m-0 font-sans text-[13px] text-err-text">{{ t("processesView.loadFailed") }}</p>
    <p v-else-if="!sessions" class="m-0 font-sans text-[13px] text-dim">{{ t("processesView.loading") }}</p>
    <p v-else-if="!sessions.length" class="m-0 font-sans text-[13px] text-dim">{{ t("processesView.empty") }}</p>
    <section v-for="session in sessions ?? []" :key="session.sessionId" data-testid="processes-session" class="mb-5">
      <p class="m-0 mb-1 flex items-baseline gap-2">
        <span class="truncate font-mono text-[12px] font-[650] text-fg">{{ session.cwd ?? t("processesView.unknownDir") }}</span>
        <span class="flex-none font-mono text-[11px] text-dim">{{ session.sessionId }}</span>
      </p>
      <table class="w-full border-collapse font-mono text-[12px]">
        <thead>
          <tr class="text-left font-sans text-[11px] text-dim">
            <th class="w-[72px] py-1 pr-2 font-normal">{{ t("processesView.col.pid") }}</th>
            <th class="w-[56px] py-1 pr-2 text-right font-normal">{{ t("processesView.col.cpu") }}</th>
            <th class="w-[64px] py-1 pr-2 text-right font-normal">{{ t("processesView.col.memory") }}</th>
            <th class="w-[88px] py-1 pr-2 text-right font-normal">{{ t("processesView.col.elapsed") }}</th>
            <th class="py-1 pr-2 font-normal">{{ t("processesView.col.command") }}</th>
            <th class="w-[64px] py-1" />
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="process in session.processes"
            :key="process.pid"
            data-testid="processes-row"
            class="border-t border-border hover:bg-hover"
            :class="rowTone(process)"
          >
            <td class="py-1 pr-2 text-dim">{{ process.pid }}</td>
            <td class="py-1 pr-2 text-right">
              <span :data-tip="isHot(process) ? t('processesView.hot') : undefined">{{ formatCpu(process.cpuPercent) }}</span>
            </td>
            <td class="py-1 pr-2 text-right">{{ formatMemory(process.rssKb) }}</td>
            <td class="py-1 pr-2 text-right" :class="isLongRunning(process) ? 'text-warn' : ''">
              <span :data-tip="isLongRunning(process) ? t('processesView.longRunning') : undefined">{{ formatElapsed(process.elapsedSeconds, now) }}</span>
            </td>
            <td class="max-w-0 truncate py-1 pr-2" :data-tip="process.command">
              <span class="pl-[calc(var(--depth)*14px)]" :style="{ '--depth': process.depth }">{{ process.command }}</span>
            </td>
            <td class="py-1 text-right">
              <span
                v-if="isPaneRoot(process)"
                class="material-symbols-outlined text-[14px] text-dim"
                :data-tip="t('processesView.paneRoot')"
                :aria-label="t('processesView.paneRoot')"
                >terminal</span
              >
              <button
                v-else
                type="button"
                data-testid="processes-kill"
                class="cursor-pointer rounded-[4px] border border-border bg-transparent px-2 py-0.5 font-sans text-[11px] text-secondary hover:bg-[var(--err-hover-bg)] hover:text-err-text disabled:cursor-default disabled:opacity-50"
                :disabled="ending !== null"
                @click="end(process)"
              >
                {{ t("processesView.kill") }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  </div>
</template>
