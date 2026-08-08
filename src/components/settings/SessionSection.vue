<script setup lang="ts">
import { appendSystemPrompt, saveAppendSystemPrompt } from "../../composables/appendSystemPrompt";
import { decisionDigest, saveDecisionDigest } from "../../composables/decisionDigest";
import { worklogEnabled, saveWorklogEnabled, worklogIntervalHours, saveWorklogIntervalHours } from "../../composables/worklog";
import { MIN_WORKLOG_INTERVAL_HOURS, MAX_WORKLOG_INTERVAL_HOURS } from "../../../common/worklogInterval";
import SettingsStepper from "./SettingsStepper.vue";

// What a spawned session carries, and what runs on its own in the background. All three are
// global config keys the server acts on — this browser only shows and writes them.
const WORKLOG_STEP_HOURS = 1;

function onAppendToggle(e: Event) {
  if (e.target instanceof HTMLInputElement) void saveAppendSystemPrompt(e.target.checked);
}
function onDigestToggle(e: Event) {
  if (e.target instanceof HTMLInputElement) void saveDecisionDigest(e.target.checked);
}
function onWorklogToggle(e: Event) {
  if (e.target instanceof HTMLInputElement) void saveWorklogEnabled(e.target.checked);
}
function nudgeInterval(delta: number) {
  void saveWorklogIntervalHours(worklogIntervalHours.value + delta);
}
</script>

<template>
  <label class="mt-1.5 flex cursor-pointer items-start gap-2">
    <input type="checkbox" class="mt-1 cursor-pointer" :checked="appendSystemPrompt" aria-label="End replies with a closing summary" @change="onAppendToggle" />
    <span class="text-[12px]">
      <strong>End replies with a closing summary</strong> — what was asked, what was achieved, what was not, under a rule. It exists for the grid: coming back
      to a cell later, that is otherwise only recoverable by scrolling the whole session. Applies to sessions started from now on; a directory's own
      <code>.mulmoterminal.json</code> wins over this.
    </span>
  </label>

  <label class="mt-2 flex cursor-pointer items-start gap-2">
    <input type="checkbox" class="mt-1 cursor-pointer" :checked="decisionDigest" aria-label="Keep a digest of decisions" @change="onDigestToggle" />
    <span class="text-[12px]">
      <strong>Keep a digest of what this project decided</strong> — a Markdown file an agent can read before asking something the project already settled.
      Writes under <code>~/.mulmoterminal/decisions/</code>.
    </span>
  </label>

  <label class="mt-2 flex cursor-pointer items-start gap-2">
    <input type="checkbox" class="mt-1 cursor-pointer" :checked="worklogEnabled" aria-label="Keep a periodic dev-work log" @change="onWorklogToggle" />
    <span class="text-[12px]">
      <strong>Keep a periodic dev-work log</strong> — summarizes recent work across your saved working directories into weekly wiki pages. Each run spawns an
      LLM session, so it costs tokens.
    </span>
  </label>
  <div class="mb-3 mt-2" :class="worklogEnabled ? '' : 'pointer-events-none opacity-50'">
    <p class="mb-1.5 text-[12px] text-dim">How often it runs:</p>
    <SettingsStepper
      :value="worklogIntervalHours"
      :unit="' h'"
      :min="MIN_WORKLOG_INTERVAL_HOURS"
      :max="MAX_WORKLOG_INTERVAL_HOURS"
      :step="WORKLOG_STEP_HOURS"
      label="dev-work log interval"
      :disabled="!worklogEnabled"
      @nudge="nudgeInterval"
    />
  </div>
</template>
