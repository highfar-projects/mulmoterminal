<script setup lang="ts">
// One icon button on a Settings list row — edit, move, put in a folder. `label` names what it does to
// which entry, for the tooltip and a screen reader alike.
defineProps<{ icon: string; label: string; active?: boolean }>();
</script>

<template>
  <button
    type="button"
    class="cursor-pointer rounded-md border-0 bg-transparent px-1 py-1 text-[14px] text-muted hover:bg-hover hover:text-fg disabled:cursor-default disabled:opacity-40"
    :class="active ? 'text-accent' : ''"
    :data-tip="label"
    :aria-label="label"
  >
    <span class="material-symbols-outlined" aria-hidden="true">{{ icon }}</span>
  </button>
</template>
