<script setup lang="ts">
// The launch form, opened at the right edge over whatever the grid is showing (#1867).
//
// WHY IT IS NOT A CELL: the grid has three view modes (docs/grid-view-modes.md) and a form placed
// as a cell means three different things — a tile that pushes its neighbours along in the tiled
// grid, a stolen enlarged slot while zoomed, and a roster row that is not even a TerminalCell.
// Sitting OVER the stage instead, as AppSettingsModal already does, is one behaviour in all three.
// It also keeps the form out of `state.cells`, so none of the "how many empty forms are open, and
// which one does `+` cancel" bookkeeping applies to it.
//
// This component owns only what the form edits (dir / agent / model choice) and forwards the four
// launch intents. Turning an intent into a cell is GridView's job, because only it can place one.
import { nextTick, onMounted, ref } from "vue";
import CellLaunchForm from "./CellLaunchForm.vue";
import type { AgentPick, CustomAgent } from "../../common/customAgents";
import type { CwdPreset } from "./presets";
import type { Launcher, LaunchPick } from "./launchers";
import type { LaunchChoice } from "./wsUrl";
import type { RunCommand } from "./runCommand";
import type { TerminalAgent } from "../../common/sessionAgent";

const props = defineProps<{
  // The directory the form opens on: the cell the panel was opened from, or the default workspace
  // when it was opened from the toolbar with no cell in view.
  initialDir: string | null;
  defaultCwd: string | null;
  presets: CwdPreset[];
  configUnavailable?: boolean | undefined;
  launchers?: Launcher[] | undefined;
  customAgents?: CustomAgent[] | undefined;
  openSessionIds?: string[] | undefined;
  openCwds?: string[] | undefined;
}>();

const emit = defineEmits<{
  // The Agent Picker's value rides along, which the form's own `start` does not carry: in a cell
  // the picker's state WAS the cell's, and here the host has to be told what was picked.
  (e: "start", value: { dir: string | null; pick: AgentPick }): void;
  (e: "resume", value: { id: string; cwd: string | null; agent?: TerminalAgent }): void;
  (e: "run", value: RunCommand): void;
  (e: "launch", value: LaunchPick): void;
  (e: "remove-preset", value: string): void;
  (e: "close" | "retry-config"): void;
}>();

const dir = ref(props.initialDir ?? props.defaultCwd ?? "");
// Claude every time, deliberately: the panel is mounted fresh per open (GridView holds it behind
// v-if), so the picker starts where the in-cell form starts rather than inheriting whatever the
// origin cell happens to run. Opening it on a codex cell is not a request to start codex.
const pickedAgent = ref<AgentPick>("claude");
const launchChoice = ref<LaunchChoice | null>(null);

const panel = ref<HTMLElement | null>(null);

// The directory field, so Enter alone starts what is picked in the dir that was carried in. The
// panel opens on a keystroke, and a keyboard path that lands focus nowhere costs a reach for the
// mouse to use the value it just filled in for you.
onMounted(async () => {
  await nextTick();
  panel.value?.querySelector<HTMLInputElement>('[data-testid="cell-dir-input"]')?.focus();
});
</script>

<template>
  <aside
    ref="panel"
    class="fixed inset-y-0 right-0 z-[90] flex w-[min(520px,92vw)] flex-col overflow-y-auto border-l border-border bg-base font-sans text-fg shadow-[-8px_0_24px_rgba(0,0,0,0.35)]"
    role="dialog"
    aria-label="Start a terminal"
    @keydown.escape="emit('close')"
  >
    <CellLaunchForm
      :dir="dir"
      :agent="pickedAgent"
      :choice="launchChoice"
      :default-cwd="defaultCwd"
      :presets="presets"
      :config-unavailable="configUnavailable === true"
      :launchers="launchers"
      :custom-agents="customAgents ?? []"
      :open-session-ids="openSessionIds"
      :open-cwds="openCwds"
      :cancellable="true"
      @update:dir="(value) => (dir = value)"
      @update:agent="(value) => (pickedAgent = value)"
      @update:choice="(value) => (launchChoice = value)"
      @start="(value) => emit('start', { dir: value, pick: pickedAgent })"
      @resume="(value) => emit('resume', value)"
      @run="(value) => emit('run', value)"
      @launch="(value) => emit('launch', value)"
      @remove-preset="(value) => emit('remove-preset', value)"
      @retry-config="emit('retry-config')"
      @close="emit('close')"
    />
  </aside>
</template>
