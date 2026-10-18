<script setup lang="ts">
defineProps<{ dirty: boolean; saving: boolean }>();
const emit = defineEmits<{ save: [] }>();
</script>

<template>
  <button
    type="button"
    class="h-[26px] cursor-pointer rounded-md border border-accent bg-accent-bg px-2.5 py-1 text-[12px] text-on-accent enabled:hover:bg-hover enabled:hover:text-fg disabled:cursor-default disabled:opacity-50"
    :disabled="!dirty || saving"
    @click="emit('save')"
  >
    {{ saving ? "Saving…" : "Save" }}
  </button>
</template>
