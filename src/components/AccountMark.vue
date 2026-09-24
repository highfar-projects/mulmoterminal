<script setup lang="ts">
// Which login a cell's session runs on (#2215), worn in its header. Nothing for the default login:
// a mark on every ordinary cell would be noise, and the default is what "no account" means.
//
// Identity rather than status, like the collection mark beside it — so it stays on a filmstrip
// thumbnail too, where two cells on the same directory differ only by this.
defineProps<{ label: string | null }>();
</script>

<template>
  <span
    v-if="label"
    data-testid="cell-account-mark"
    class="inline-flex max-w-[12ch] flex-none items-center gap-1 rounded-[10px] border border-border bg-elevated px-[7px] py-px font-mono text-[11px] text-secondary"
    :title="`Runs on the ${label} account`"
    ><span class="material-symbols-outlined text-[13px]" aria-hidden="true">account_circle</span><span class="truncate">{{ label }}</span></span
  >
</template>
