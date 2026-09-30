<script setup lang="ts">
import { watch, useTemplateRef } from "vue";
import { useAnchoredMenu } from "../composables/useAnchoredMenu";
import { LIST_MENU_ITEM_CLASS, LIST_MENU_PANEL_CLASS } from "./anchoredMenuClasses";
import { useDirScripts, type RunnableScript } from "../composables/useDirLists";
import { scriptRunCommand, type RunCommand } from "./runCommand";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

// A header dropdown that lists a directory's script.json entries and emits the one
// picked, so the parent can launch it. Scripts are fetched up front (and on cwd
// change) so the button only appears when the open project actually has scripts —
// no file, no button.
const props = defineProps<{ cwd: string | null }>();
const emit = defineEmits<{ (e: "run", command: RunCommand): void }>();

// The same list the launch form offers for a directory — including the resolved dir the entries
// belong to (the server may fall back from a bad path), which is where the picked command runs.
// No dir yet (e.g. a single-view reconnect before the session message arrives) reads as no
// scripts, rather than a fetch with an empty cwd that the server would resolve to the DEFAULT
// workspace — the wrong project's scripts.
const { value: scriptList, load: loadScripts } = useDirScripts();

// Teleported and pulled back inside the viewport, because this row sits at the cell's right edge
// often enough that a menu hanging rightwards from it was cut off by the cell.
const trigger = useTemplateRef<HTMLElement>("trigger");
const menu = useTemplateRef<HTMLElement>("menu");
const { open, pos, close, leave, toggle, onMenuKeydown } = useAnchoredMenu(trigger, menu, {
  itemSelector: '[role="menuitem"]',
  initialItem: (items) => items[0],
});

watch(
  () => props.cwd,
  (dir) => {
    // Close first: a cwd change invalidates the open dropdown (and would otherwise
    // leave the global listeners attached and the menu re-appearing pre-opened on a
    // later cwd, since the button can unmount while `open` stays true).
    close();
    void loadScripts(dir);
  },
  { immediate: true },
);

function pick(s: RunnableScript) {
  emit("run", scriptRunCommand(s, scriptList.value.cwd ?? props.cwd));
  leave();
}
</script>

<template>
  <span v-if="scriptList.scripts.length" ref="trigger" class="inline-flex flex-none">
    <button
      class="inline-flex items-center gap-1 border border-border bg-base text-secondary font-sans text-[12px] leading-none py-[5px] px-2.5 rounded-md cursor-pointer hover:bg-hover hover:text-fg aria-expanded:bg-hover aria-expanded:text-fg"
      :aria-expanded="open"
      aria-haspopup="menu"
      :data-tip="t('tips.overlays.runScript')"
      @click="toggle"
    >
      <span class="material-symbols-outlined" aria-hidden="true">play_arrow</span> Run
      <span class="material-symbols-outlined" aria-hidden="true">{{ open ? "expand_less" : "expand_more" }}</span>
    </button>
    <Teleport to="body">
      <!-- `pointerdown.stop`: the menu lives outside the trigger, and the dropdown closes on any
           pointerdown it does not contain. -->
      <div
        v-if="open"
        ref="menu"
        data-testid="run-menu"
        role="menu"
        :class="LIST_MENU_PANEL_CLASS"
        :style="{ top: `${pos.top}px`, left: `${pos.left}px` }"
        @pointerdown.stop
        @keydown="onMenuKeydown"
      >
        <button v-for="s in scriptList.scripts" :key="s.index" :class="LIST_MENU_ITEM_CLASS" role="menuitem" :data-tip="s.command" @click="pick(s)">
          <span class="material-symbols-outlined flex-none" aria-hidden="true">play_arrow</span>
          <span class="truncate">{{ s.label }}</span>
        </button>
      </div>
    </Teleport>
  </span>
</template>
