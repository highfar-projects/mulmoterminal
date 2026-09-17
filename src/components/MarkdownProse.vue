<script setup lang="ts">
// The one rendered-markdown surface outside the wiki (#2112) — an agent's reply in the conversation
// pane, drawn as the document it is rather than as the characters it is made of.
//
// A component rather than a `v-html` in the pane, for the reason WikiProse.vue is one: markdown in,
// never HTML, so no caller can hand this a string of its own and the sanitizer cannot be bypassed by
// someone building the markup somewhere else. The `.md-prose` class is what styles the tags marked
// produces — they carry no classes of their own, so the rules live in src/style.css beside the
// wiki's (CLAUDE.md sends what a utility cannot express to one global stylesheet, with the reason).
import { computed } from "vue";
import { renderMarkdownProse } from "../markdownProse";

const props = defineProps<{ markdown: string }>();

const html = computed(() => renderMarkdownProse(props.markdown));
</script>

<template>
  <!-- eslint-disable-next-line vue/no-v-html -- markdown in, sanitized in renderMarkdownProse -->
  <div class="md-prose select-text break-words" v-html="html"></div>
</template>
