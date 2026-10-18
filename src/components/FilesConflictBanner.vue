<script setup lang="ts">
// The open file changed on disk while it had unsaved edits: nothing was saved, and the reader picks.
defineEmits<{ reload: []; overwrite: [] }>();
</script>

<template>
  <div
    role="alert"
    data-testid="files-conflict"
    class="absolute inset-x-0 top-0 z-10 flex flex-wrap items-center gap-2 border-b border-amber bg-[var(--warn-bg-subtle)] px-4 py-2 text-[13px] text-warn"
  >
    <span class="material-symbols-outlined" aria-hidden="true">warning</span>
    <span class="flex-auto">This file changed on disk. Nothing was saved — your version is kept as a backup either way.</span>
    <button
      type="button"
      class="h-[26px] cursor-pointer rounded-md border border-border bg-base px-2.5 py-1 text-[12px] text-secondary hover:bg-hover hover:text-fg"
      @click="$emit('reload')"
    >
      Reload (discard your edits)
    </button>
    <button
      type="button"
      class="h-[26px] cursor-pointer rounded-md border border-border bg-base px-2.5 py-1 text-[12px] text-secondary hover:bg-hover hover:text-fg"
      @click="$emit('overwrite')"
    >
      Overwrite anyway
    </button>
  </div>
</template>
