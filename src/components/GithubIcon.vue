<script setup lang="ts">
import { computed } from "vue";
import { GITHUB_ICON_PATHS, type GithubIconName } from "../../common/githubIcons";

const props = defineProps<{ name: GithubIconName }>();
const paths = computed(() => GITHUB_ICON_PATHS[props.name]);
</script>

<template>
  <!-- 1em, so the caller sizes it with the same text-[..] it would give a Material Symbol. -->
  <svg class="inline-block size-[1em] flex-none" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" :data-github-icon="name">
    <path v-for="d in paths" :key="d" :d="d" />
  </svg>
</template>
