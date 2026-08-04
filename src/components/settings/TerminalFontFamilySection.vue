<script setup lang="ts">
import { ref, watch } from "vue";
import { configuredFontFamily, saveGlobalFontFamily } from "../../composables/terminalFontFamily";
import { TERMINAL_FONT_FAMILY_DEFAULT } from "../../../common/terminalFontFamily";
import SettingsButton from "../SettingsButton.vue";
import SettingsField from "../SettingsField.vue";
import { SECTION_HEADING } from "./sectionClasses";

// Global, unlike the font SIZE above it: a family names FONTS, and which fonts exist belongs to
// the machine the browser runs on, so it is one answer for every client of one host.
//
// An editable mirror rather than a bound ref, like the list sections: typing a stack character by
// character must not POST on every keystroke, and a half-typed family name is not a stack.
const draft = ref(configuredFontFamily.value ?? "");
watch(configuredFontFamily, (value) => (draft.value = value ?? ""));

const saving = ref(false);
async function apply() {
  saving.value = true;
  // Blank means "use the built-in" — the saver maps it to null rather than to an empty stack.
  await saveGlobalFontFamily(draft.value.trim() || null);
  saving.value = false;
}
</script>

<template>
  <h3 :class="SECTION_HEADING">Terminal font</h3>
  <p class="mb-2 mt-1.5 text-[12px] text-dim">
    The CSS font-family stack every terminal renders in. Reach for it when CJK text looks wrong — a stack whose first face has no Japanese glyphs falls back per
    character, and the line stops lining up. Leave it empty for the built-in stack. A directory can pin its own with <code>fontFamily</code> in its
    <code>.mulmoterminal.json</code>.
  </p>
  <div class="flex items-center gap-2">
    <SettingsField
      v-model="draft"
      class="flex-auto font-mono"
      :placeholder="TERMINAL_FONT_FAMILY_DEFAULT"
      aria-label="Terminal font family stack"
      spellcheck="false"
      @keydown.enter="apply"
    />
    <SettingsButton :disabled="saving || draft.trim() === (configuredFontFamily ?? '')" @click="apply">Apply</SettingsButton>
  </div>
  <p class="mb-3 mt-1.5 text-[12px] text-dim">
    Open terminals re-fit as soon as this lands — a different face has a different advance width, so the grid would drift from the canvas otherwise.
  </p>
</template>
