<script setup lang="ts">
import { useTerminalScrollSpeed } from "../../composables/useTerminalScrollSpeed";
import { useScrollToBottomOnSubmit } from "../../composables/useScrollToBottomOnSubmit";
import SettingsStepper from "./SettingsStepper.vue";

// Same shape and the same per-browser reasoning as the font size: it is a property of the
// pointing device, and a trackpad and a wheel mouse want different answers.
const { scrollSpeed, nudgeScrollSpeed, min, max, step } = useTerminalScrollSpeed();
const { scrollToBottomOnSubmit, setScrollToBottomOnSubmit } = useScrollToBottomOnSubmit();
function onReturnToggle(e: Event) {
  if (e.target instanceof HTMLInputElement) setScrollToBottomOnSubmit(e.target.checked);
}
</script>

<template>
  <SettingsStepper :value="scrollSpeed" unit="×" :min="min" :max="max" :step="step" label="terminal scroll speed" @nudge="nudgeScrollSpeed" />
  <p class="mb-3 mt-1.5 text-[12px] text-dim">
    How far one wheel notch or trackpad swipe moves the terminal — 1× is the default. Lower it if a two-finger scroll on a Mac trackpad flies past what you were
    reading. Per browser, and it covers both a shell's scrollback and a full-screen app like Claude Code.
  </p>

  <label class="mt-1.5 flex cursor-pointer items-start gap-2">
    <input
      type="checkbox"
      class="mt-1 cursor-pointer"
      :checked="scrollToBottomOnSubmit"
      aria-label="Return to the latest output when you send"
      @change="onReturnToggle"
    />
    <span class="text-[12px]">
      <strong>Return to the latest output when you send</strong> — pressing Enter (or a send button) takes a scrolled-up terminal back to the bottom, the way an
      ordinary terminal does. A shell already behaves this way; a full-screen agent like Claude Code keeps its own scroll position and does not, so this unwinds
      exactly the scrolling you did. Turn it off to stay where you are reading while a turn runs.
    </span>
  </label>
</template>
