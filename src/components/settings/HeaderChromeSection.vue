<script setup lang="ts">
import { headerButtonCount, headerChipCount } from "../../composables/headerConfigSummary";
import SkillLaunchButton from "../SkillLaunchButton.vue";
import { SECTION_HEADING } from "./sectionClasses";
import type { BundledSkillName } from "../../../common/bundledSkills";

// Read-only. A button carries a command, a run mode and a `when` scope, and a chip a template
// substituted with the session's live context — an editor for that is a small IDE, and the skill
// already asks the two questions ("what should it do", "where should it appear") that produce a
// correct entry.
//
// `null` is not zero: the key is unconfigured, so the built-in header applies. An empty array is a
// user who removed every button, and saying "0" for both would hide that difference.
defineEmits<{ (e: "launch-skill", skill: BundledSkillName): void }>();

function describe(count: number | null, noun: string): string {
  if (count === null) return `built-in ${noun}s`;
  if (count === 0) return `no ${noun}s (all removed)`;
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}
</script>

<template>
  <h3 :class="SECTION_HEADING">Header buttons and chips</h3>
  <p class="mb-2 mt-1.5 text-[12px] text-dim">
    The action buttons and the read-out chips along a terminal's header. Globally you have
    <strong class="text-fg">{{ describe(headerButtonCount, "button") }}</strong> and <strong class="text-fg">{{ describe(headerChipCount, "chip") }}</strong
    >; a project can add or replace its own by id in its <code>.mulmoterminal.json</code>, so what a given terminal shows is the two merged.
  </p>
  <div class="mb-3">
    <SkillLaunchButton skill="mulmoterminal-header" icon="widgets" label="Set up header buttons…" @launch="$emit('launch-skill', $event)" />
  </div>
</template>
