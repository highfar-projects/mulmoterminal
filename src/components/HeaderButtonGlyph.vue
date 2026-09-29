<script setup lang="ts">
// A configured header button's glyph: its `emoji` if it has one, else its `icon`, else `bolt`.
import IconGlyph from "./IconGlyph.vue";

defineProps<{ emoji?: string | undefined; icon?: string | undefined }>();
</script>

<template>
  <span v-if="emoji" class="text-[15px] leading-none">{{ emoji }}</span>
  <IconGlyph v-else :icon="icon || 'bolt'" material-class="text-[18px]" github-class="m-0.5 text-[14px]" />
</template>
