<script setup lang="ts">
// One icon button in the Files pane header. Extracted because the utility run behind it was written
// out once per button, which is what the styling rule asks to be turned into a shared COMPONENT —
// a shared CSS class is the thing that silently stops applying when a template gains a fragment
// root, and utilities have no such failure mode.
//
// Icon buttons only. `Canvas` and `Save` carry words rather than a symbol, and `Save` is the accent
// variant with a disabled state; folding those in would mean a prop per difference and a component
// that is a worse way to write the thing it replaced.
defineProps<{
  /** A Material Symbols name — the repo's icon set. Never an emoji. */
  icon: string;
  /** Shown on hover AND used as the accessible name, which is otherwise absent: the button's only
   *  content is a glyph marked `aria-hidden`. */
  label: string;
  testId?: string;
  /** Keep this button's pointerdown from reaching `window`.
   *
   *  ONLY for a button that OPENS one of the pane's panels. Those panels close themselves on a
   *  pointerdown anywhere outside, so without this the very gesture that opens one would also shut
   *  it. Every other button wants the event to travel: clicking "reload" while the finder is open
   *  means "reload, and I am done with the finder", and stopping it there would leave the panel up.
   *  Default off, because that is what all but one button did before this component existed. */
  opensAPanel?: boolean;
}>();
const emit = defineEmits<{ click: [] }>();
</script>

<template>
  <button
    type="button"
    :data-testid="testId"
    class="h-[26px] cursor-pointer rounded-md border border-border bg-base px-2.5 py-1 text-[12px] text-secondary enabled:hover:bg-hover enabled:hover:text-fg disabled:cursor-default disabled:opacity-50"
    :title="label"
    :aria-label="label"
    @pointerdown="opensAPanel && $event.stopPropagation()"
    @click="emit('click')"
  >
    <span class="material-symbols-outlined" aria-hidden="true">{{ icon }}</span>
  </button>
</template>
