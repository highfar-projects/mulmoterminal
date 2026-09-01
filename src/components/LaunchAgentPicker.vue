<script setup lang="ts">
// Which agent a chat started from the collection surfaces will run — shown where the choice is
// made, and where its consequence lands (#1938).
//
// One component rather than a select copied per surface, because the value is ONE global
// (`launchAgent`, localStorage `mt-launch-agent`): someone who learns the control in the
// Collections browser has to recognise the same thing in a cell's pane.
//
// `nonDefaultOnly` renders NOTHING while the value is claude, which is the rule the agent badges
// already follow (common/sessionAgent.ts): claude is the default everywhere, so marking it would
// put a chip on every pane and stop the chip meaning "this one is not what you expect". The
// surface that OWNS the choice must not pass it — a control that hides itself whenever it holds
// its default can never be used to leave that default.
//
// The words come from the HOST. Only the Settings modal is translated (src/i18n/en.ts) and this is
// used on both sides of that edge, so a `t()` in here would drag the collection surfaces into a
// half-migrated bundle (#1566).
import { computed } from "vue";
import { launchAgent } from "../composables/useChatLauncher";
import { BUILTIN_AGENT_OPTIONS } from "./agentPicker";

const props = defineProps<{
  /** The words beside the select. Without them the icon stands in — for a pane too narrow to
   *  spend 60px saying what the select already shows. */
  label?: string;
  /** Hover text, and the accessible name wherever `label` is not on screen. */
  description: string;
  /** Stay out of the way while the value is the default. */
  nonDefaultOnly?: boolean;
}>();

const shown = computed(() => props.nonDefaultOnly !== true || launchAgent.value !== "claude");
</script>

<template>
  <!-- A <label> wrapper rather than a loose span beside the select: it gives the visible words the
       accessible name for free, and makes them a second hit target for the same control. -->
  <label v-if="shown" class="flex flex-none items-center gap-1.5" data-testid="launch-agent-picker" :title="description">
    <span v-if="label" class="text-[11px] uppercase tracking-[0.05em] text-dim">{{ label }}</span>
    <span v-else class="material-symbols-outlined text-[14px] text-dim" aria-hidden="true">rocket_launch</span>
    <!-- Not SELECT_CONTROL: that is sized for settings forms (w-full, taller padding); this sits on
         thin toolbar rows beside py-[3px] chips and matches their height instead. -->
    <select
      v-model="launchAgent"
      :aria-label="label ? undefined : description"
      class="cursor-pointer rounded-[5px] border border-border bg-input px-1.5 py-[3px] font-sans text-[12px] text-fg focus:border-accent focus:outline-none"
    >
      <option v-for="o in BUILTIN_AGENT_OPTIONS" :key="o.agent" :value="o.agent">{{ o.label }}</option>
    </select>
  </label>
</template>
