<script setup lang="ts">
// An icon named by a string: `github:<name>` draws that Octicon, anything else is a Material
// Symbols name. The two take separate size classes because an Octicon fills its 16px grid where a
// Material Symbol leaves a margin, so the same font size draws it visibly larger.
import { computed } from "vue";
import GithubIcon from "./GithubIcon.vue";
import { githubIconOf } from "../../common/githubIcons";

const props = defineProps<{ icon: string; materialClass: string; githubClass: string }>();
const github = computed(() => githubIconOf(props.icon));
</script>

<template>
  <GithubIcon v-if="github" :name="github" :class="githubClass" />
  <span v-else class="material-symbols-outlined" :class="materialClass" aria-hidden="true">{{ icon }}</span>
</template>
