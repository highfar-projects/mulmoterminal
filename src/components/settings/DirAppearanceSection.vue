<script setup lang="ts">
import SkillLaunchButton from "../SkillLaunchButton.vue";
import { autoDirIcon, saveAutoDirIcon } from "../../composables/autoDirIcon";
import type { BundledSkillName } from "../../../common/bundledSkills";

const emit = defineEmits<{ (e: "launch-skill", skill: BundledSkillName): void }>();

// The browser has already moved the checkbox by the time this runs, and a failed save leaves the
// ref where it was — so Vue sees no change to patch and the box keeps showing a value that was
// never stored. Putting it back is the only thing that says the save didn't happen (CodeRabbit
// on #1429). The six older toggles in Settings share this shape and this gap; fixing them is its
// own change, since it belongs in the shared helper rather than in one section.
async function onAutoIconToggle(e: Event): Promise<void> {
  if (!(e.target instanceof HTMLInputElement)) return;
  const input = e.target;
  if (!(await saveAutoDirIcon(input.checked))) input.checked = autoDirIcon.value;
}
</script>

<template>
  <p class="mb-3 mt-1.5 text-[12px] text-dim">
    Launch the <code>mulmoterminal-dirs</code> skill to style and order your directories — name badge, icon, colors, terminal palette, grid position. It starts
    from the directories you actually open, reads the settings you already have, and follows the same pattern for the ones that have none.
  </p>
  <SkillLaunchButton skill="mulmoterminal-dirs" icon="palette" label="Configure appearance…" @launch="emit('launch-skill', $event)" />

  <!-- The off switch for a setting that is ON by default. Without it, turning the behaviour off
       would mean writing `"icon": false` into every project that happens to ship a favicon. -->
  <label class="mt-3 flex cursor-pointer items-start gap-2">
    <input
      type="checkbox"
      class="mt-1 cursor-pointer"
      data-testid="auto-dir-icon"
      :checked="autoDirIcon"
      aria-label="Use a project's own favicon"
      @change="onAutoIconToggle"
    />
    <span class="text-[12px]">
      <strong>Use a project's own favicon</strong> — a directory that sets no <code>icon</code> shows the one its repository already ships
      (<code>public/favicon.svg</code>, <code>apple-touch-icon.png</code>, a web manifest). A project that wants none sets <code>"icon": false</code> in its own
      <code>.mulmoterminal.json</code>, which this does not override.
    </span>
  </label>
</template>
