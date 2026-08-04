<script setup lang="ts">
import { useRosterAlert } from "../../composables/useRosterAlert";
import { cockpitLines, saveCockpitLines } from "../../composables/cockpitLines";
import { COCKPIT_LINES_MIN, COCKPIT_LINES_MAX, type CockpitLines } from "../../../common/cockpitLines";
import SettingsStepper from "./SettingsStepper.vue";
import { SECTION_HEADING } from "./sectionClasses";

// Whether a roster row waiting on the user blinks (#1131) — per browser for the same reason the
// sizes above are: it is the person watching the screen who finds movement useful or distracting,
// not the host.
const { blink: rosterBlink, setBlink: setRosterBlink } = useRosterAlert();
function onRosterBlinkToggle(e: Event) {
  if (e.target instanceof HTMLInputElement) setRosterBlink(e.target.checked);
}

// How far each roster line clamps (#877) — GLOBAL, unlike the blink above: it trades roster length
// against how much of a row you can read, which is a property of the sessions rather than of the
// screen you happen to be watching.
//
// One stepper per field because the three are worth different amounts: a summary says what a
// session is doing now, while a prompt is usually done in two lines.
const LINE_FIELDS: { key: keyof CockpitLines; label: string }[] = [
  { key: "summary", label: "Summary" },
  { key: "prompt", label: "Your prompt" },
  { key: "response", label: "Last reply" },
];
const LINE_STEP = 1;

// The whole object goes each time — the saver's contract, since the server merges by field.
function nudgeLines(key: keyof CockpitLines, delta: number) {
  void saveCockpitLines({ ...cockpitLines.value, [key]: cockpitLines.value[key] + delta });
}
</script>

<template>
  <h3 :class="SECTION_HEADING">Waiting rows</h3>
  <p class="mb-2 mt-1.5 text-[12px] text-dim">
    In the list beside an enlarged cell, a row whose agent is <strong>waiting on you</strong> — a permission prompt, a question — carries an amber ring and
    blinks. A row that has simply <strong>finished</strong> is green and holds still. Turning this off keeps both colours and stops the movement; rows never
    blink when your system asks for reduced motion.
  </p>
  <label class="mb-3 flex cursor-pointer items-center gap-2">
    <input type="checkbox" class="cursor-pointer" :checked="rosterBlink" aria-label="Blink a row that is waiting on me" @change="onRosterBlinkToggle" />
    <span class="text-[13px]">Blink a row that is waiting on me</span>
  </label>

  <p class="mb-2 text-[12px] text-dim">
    <strong class="text-fg">Lines per row</strong> — how much of each row is shown before it clamps. Raising these trades how many sessions fit on screen for
    reading a long one in place.
  </p>
  <div v-for="field in LINE_FIELDS" :key="field.key" class="mb-1.5 flex items-center gap-3">
    <span class="min-w-[92px] text-[12px] text-fg">{{ field.label }}</span>
    <SettingsStepper
      :value="cockpitLines[field.key]"
      :unit="''"
      :min="COCKPIT_LINES_MIN"
      :max="COCKPIT_LINES_MAX"
      :step="LINE_STEP"
      :label="`${field.label.toLowerCase()} line count`"
      @nudge="nudgeLines(field.key, $event)"
    />
  </div>
</template>
