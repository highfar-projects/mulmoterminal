<script setup lang="ts">
import { watch, useTemplateRef } from "vue";
import { useDropdownMenu } from "../composables/useDropdownMenu";
import { useDirLaunchConfigs, type RunnableLaunchConfig } from "../composables/useDirLists";
import type { RunCommand } from "./runCommand";

// A header dropdown that lists a directory's .vscode/launch.json configurations and emits the one
// picked, so the parent can launch it — the same idea as RunMenu.vue, one file over. No debugger,
// no breakpoints: server/files/launchConfigs.ts translates each configuration into a plain shell
// command, so this offers a way to RUN a launch config, not to debug one. Fetched up front (and on
// cwd change) so the button only appears when the open project actually has runnable configs — no
// file (or a file with nothing this app knows how to run), no button.
const props = defineProps<{ cwd: string | null }>();
const emit = defineEmits<{ (e: "run", command: RunCommand): void }>();

// The same list the launch form offers for a directory — including the resolved dir the entries
// belong to (the server may fall back from a bad path), which is where the picked command runs.
const { value: configList, load: loadLaunchConfigs } = useDirLaunchConfigs();

const rootRef = useTemplateRef<HTMLElement>("root");
const { open, close, toggle } = useDropdownMenu(rootRef);

watch(
  () => props.cwd,
  (dir) => {
    // Close first: a cwd change invalidates the open dropdown (and would otherwise
    // leave the global listeners attached and the menu re-appearing pre-opened on a
    // later cwd, since the button can unmount while `open` stays true).
    close();
    void loadLaunchConfigs(dir);
  },
  { immediate: true },
);

function pick(c: RunnableLaunchConfig) {
  emit("run", { source: "launch", index: c.index, label: c.label, cwd: configList.value.cwd ?? props.cwd });
  close();
}
</script>

<template>
  <div v-if="configList.configs.length" ref="root" class="relative inline-flex">
    <button
      class="inline-flex items-center gap-1 border border-border bg-base text-secondary font-sans text-[12px] leading-none py-[5px] px-2.5 rounded-md cursor-pointer hover:bg-hover hover:text-fg aria-expanded:bg-hover aria-expanded:text-fg"
      :aria-expanded="open"
      aria-haspopup="menu"
      title="Run a .vscode/launch.json configuration in a spare terminal"
      @click="toggle"
    >
      <span class="material-symbols-outlined" aria-hidden="true">rocket_launch</span> Launch
      <span class="material-symbols-outlined" aria-hidden="true">{{ open ? "expand_less" : "expand_more" }}</span>
    </button>
    <div
      v-if="open"
      class="absolute top-[calc(100%+4px)] left-0 z-20 min-w-[180px] max-h-80 overflow-y-auto flex flex-col p-1 bg-panel border border-border rounded-md shadow-[0_6px_20px_rgba(0,0,0,0.35)]"
      role="menu"
    >
      <button
        v-for="c in configList.configs"
        :key="c.index"
        class="inline-flex items-center gap-1 text-left border-0 bg-transparent text-secondary font-mono text-[12px] py-1.5 px-2 rounded cursor-pointer whitespace-nowrap hover:bg-hover hover:text-fg"
        role="menuitem"
        :title="c.command"
        @click="pick(c)"
      >
        <span class="material-symbols-outlined" aria-hidden="true">rocket_launch</span> {{ c.label }}
      </button>
    </div>
  </div>
</template>
