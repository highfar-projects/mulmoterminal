<script setup lang="ts">
import { computed } from "vue";
import { activeKeymap } from "../../composables/activeKeymap";
import { copyOnSelect, saveCopyOnSelect } from "../../composables/copyOnSelect";
import { terminalSubmitMode, saveTerminalSubmitMode } from "../../composables/terminalSubmitMode";
import { TERMINAL_SUBMIT_MODES, isTerminalSubmitMode, type TerminalSubmitMode } from "../../../common/terminalSubmit";
import { keymapRows, sendRows } from "../keymapLabels";
import SkillLaunchButton from "../SkillLaunchButton.vue";
import { SECTION_HEADING } from "./sectionClasses";
import type { BundledSkillName } from "../../../common/bundledSkills";

const emit = defineEmits<{ (e: "launch-skill", skill: BundledSkillName): void }>();

// Reactive, not a snapshot: /api/config is fetched asynchronously, so a modal opened before it
// lands would otherwise sit on "Not set" for every action until it is closed and reopened.
const shortcutRows = computed(() => keymapRows(activeKeymap.value));
const sendKeyRows = computed(() => sendRows(activeKeymap.value));

// The two key-behaviour settings that are a single value each, so they get a control here rather
// than the skill the keymap needs. The keymap itself stays read-only: a binding takes its key away
// from the program inside the terminal, which is a question about the user's agent, not a toggle.
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
  <h3 :class="SECTION_HEADING">Terminal keys</h3>

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

  <h3 :class="SECTION_HEADING">Keyboard shortcuts</h3>
  <p class="mb-3 mt-1.5 text-[12px] text-dim">
    Read-only. Shortcuts are off until you bind them in <code>~/.mulmoterminal/config.json</code> under <code>keymap</code> — every key you bind stops reaching
    the program inside the terminal, so the skill checks a binding against what your agent already uses before writing it. Or see the
    <a class="text-accent underline" href="https://receptron.github.io/mulmoterminal/guide/en/config.html#keymap" target="_blank" rel="noopener noreferrer"
      >guide</a
    >.
  </p>
  <div class="flex flex-col gap-1" role="list" aria-label="Keyboard shortcuts">
    <div
      v-for="row in shortcutRows"
      :key="row.action"
      role="listitem"
      class="flex items-center gap-2 rounded-md border border-border bg-elevated px-2.5 py-1.5"
    >
      <span class="min-w-0 flex-1 truncate text-[12px] text-fg">{{ row.label }}</span>
      <code v-if="row.binding" class="shrink-0 rounded border border-border bg-subtle px-1.5 py-0.5 font-mono text-[11px] text-fg">{{ row.binding }}</code>
      <span v-else class="shrink-0 text-[11px] text-muted">Not set</span>
      <code class="shrink-0 font-mono text-[10px] text-muted">{{ row.action }}</code>
    </div>
    <div v-for="row in sendKeyRows" :key="row.id" role="listitem" class="flex items-center gap-2 rounded-md border border-border bg-elevated px-2.5 py-1.5">
      <span class="min-w-0 flex-1 truncate text-[12px] text-fg"
        >Send <code class="font-mono text-[11px]">{{ row.label }}</code> to the terminal</span
      >
      <code class="shrink-0 rounded border border-border bg-subtle px-1.5 py-0.5 font-mono text-[11px] text-fg">{{ row.key }}</code>
      <code class="shrink-0 font-mono text-[10px] text-muted">send</code>
    </div>
  </div>
  <div class="mt-3">
    <SkillLaunchButton skill="mulmoterminal-keys" icon="keyboard" label="Set up shortcuts…" @launch="emit('launch-skill', $event)" />
  </div>
</template>
