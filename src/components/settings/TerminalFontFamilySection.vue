<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { configuredFontFamily, saveGlobalFontFamily } from "../../composables/terminalFontFamily";
import { normalizeFontFamily, TERMINAL_FONT_FAMILY_DEFAULT } from "../../../common/terminalFontFamily";
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

// Judged with the SAME function the server sanitizes with, the way the list sections judge a repo
// or an MCP server. Without it this field silently eats the input: an unusable stack normalizes to
// null, which saves as "use the built-in", and when nothing was configured before, the saved value
// does not change — so the watch never fires, the text stays in the box, and pressing Apply again
// does nothing and says nothing. Blank is not invalid; it is how you ask for the built-in stack.
const trimmed = computed(() => draft.value.trim());
const usable = computed(() => trimmed.value === "" || normalizeFontFamily(trimmed.value) !== null);
const unchanged = computed(() => trimmed.value === (configuredFontFamily.value ?? ""));

const saving = ref(false);
async function apply() {
  if (!usable.value || unchanged.value) return;
  saving.value = true;
  // Blank means "use the built-in" — the saver maps it to null rather than to an empty stack.
  await saveGlobalFontFamily(trimmed.value || null);
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
    <SettingsButton :disabled="saving || unchanged || !usable" @click="apply">Apply</SettingsButton>
  </div>
  <p v-if="!usable" class="mb-3 mt-1.5 text-[12px] text-err-text">
    Not a font stack. Separate names with commas — <code>'Cica', 'MS Gothic', monospace</code>. CSS syntax characters and unbalanced quotes are refused, because
    one bad entry invalidates the whole declaration.
  </p>
  <p v-else class="mb-3 mt-1.5 text-[12px] text-dim">
    Open terminals re-fit as soon as this lands — a different face has a different advance width, so the grid would drift from the canvas otherwise.
    <code>monospace</code> is appended when you name no generic family, so a stack that matches nothing still falls back to a fixed-width face.
  </p>
</template>
