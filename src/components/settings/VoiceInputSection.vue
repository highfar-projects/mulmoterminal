<script setup lang="ts">
import { VOICE_LANGUAGES, voiceLanguage } from "../../composables/voiceLanguage";
import { SELECT_CONTROL } from "../selectClasses";

// Voice input's language mode. The setting is a singleton ref (localStorage-backed), so it needs no
// prop/emit plumbing.
//
// Whether the machine can transcribe at all is asked by the MODAL, not here: capability decides
// whether the sidebar offers this tab, and a section that hid itself inside a tab of its own would
// leave an empty pane behind the button.
</script>

<template>
  <p class="mb-3 mt-1.5 text-[12px] text-dim">
    The language you dictate in. Speaking a language the mic is not expecting comes back <strong>translated</strong> into the expected one — so pick the one you
    actually speak rather than leaving it on your browser's.
  </p>
  <select v-model="voiceLanguage" aria-label="Language for voice input" :class="SELECT_CONTROL">
    <option value="locale">My browser's language</option>
    <option value="auto">Detect from what I say</option>
    <optgroup label="Always this language">
      <option v-for="lang in VOICE_LANGUAGES" :key="lang.code" :value="lang.code">{{ lang.label }}</option>
    </optgroup>
  </select>
</template>
