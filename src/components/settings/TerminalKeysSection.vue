<script setup lang="ts">
import { copyOnSelect, saveCopyOnSelect } from "../../composables/copyOnSelect";
import { terminalSubmitMode, saveTerminalSubmitMode } from "../../composables/terminalSubmitMode";
import { TERMINAL_SUBMIT_MODES, isTerminalSubmitMode, type TerminalSubmitMode } from "../../../common/terminalSubmit";

// The two key-behaviour settings that are a single value each, so they get a control here rather
// than the skill the keymap needs. The keymap itself stays read-only in KeyboardShortcutsSection:
// a binding takes its key away from the program inside the terminal, which is a question about the
// user's agent, not a toggle.
function onCopyOnSelectToggle(e: Event) {
  if (e.target instanceof HTMLInputElement) void saveCopyOnSelect(e.target.checked);
}

const SUBMIT_MODE_LABEL: Record<TerminalSubmitMode, string> = {
  cr: "Enter submits, Option/Alt+Enter makes a newline (default)",
  "esc-cr": "Option/Alt+Enter submits, Enter makes a newline",
};
function onSubmitModeChange(e: Event) {
  if (e.target instanceof HTMLSelectElement && isTerminalSubmitMode(e.target.value)) void saveTerminalSubmitMode(e.target.value);
}
</script>

<template>
  <label class="mt-1.5 flex cursor-pointer items-start gap-2">
    <input
      type="checkbox"
      class="mt-1 cursor-pointer"
      :checked="copyOnSelect"
      aria-label="Copy a selection as soon as it settles"
      @change="onCopyOnSelectToggle"
    />
    <span class="text-[12px]">
      <strong>Copy on select</strong> — put a mouse selection on the clipboard the moment it settles, with no key pressed. It is the one setting that writes the
      clipboard when you only meant to highlight.
    </span>
  </label>

  <p class="mb-1.5 mt-3 text-[12px] text-dim">
    <strong class="text-fg">Enter key</strong> — which bytes the Claude Code running in the terminal reads as "submit". Match it to how you have Claude
    configured; it applies to Claude sessions only, so a shell's Enter is untouched.
  </p>
  <select
    class="mb-1 w-full cursor-pointer rounded-lg border border-border bg-elevated px-2 py-1.5 text-[12px] text-fg"
    :value="terminalSubmitMode"
    aria-label="Which bytes submit in a Claude session"
    @change="onSubmitModeChange"
  >
    <option v-for="mode in TERMINAL_SUBMIT_MODES" :key="mode" :value="mode">{{ SUBMIT_MODE_LABEL[mode] }}</option>
  </select>
</template>
