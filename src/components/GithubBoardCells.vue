<script setup lang="ts">
// The live terminals on a board card's branch (#3172), each a jump to its cell when the grid holds
// it. Shared by the card and its detail panel (#3177).
import { useI18n } from "vue-i18n";
import type { BoardCell } from "../../common/githubBoard";
import { gridSessionJump } from "../composables/gridSessionJump";
import { homeRelative } from "./cwdDisplay";

defineProps<{ cells: BoardCell[]; home: string | null }>();

const { t } = useI18n();

const cellState = (cell: BoardCell): "working" | "waiting" | "idle" => {
  if (cell.waiting) return "waiting";
  return cell.working ? "working" : "idle";
};

const CELL_DOT: Record<"working" | "waiting" | "idle", string> = { working: "bg-[#3fae6b]", waiting: "bg-amber", idle: "bg-dim" };

const inGrid = (cell: BoardCell): boolean => gridSessionJump.value?.has(cell.session) ?? false;

const jump = (cell: BoardCell): void => gridSessionJump.value?.goTo(cell.session);
</script>

<template>
  <ul class="m-0 flex list-none flex-col gap-0.5 p-0">
    <li v-for="cell in cells" :key="cell.session">
      <button
        type="button"
        data-testid="board-cell"
        class="flex w-full min-w-0 items-center gap-1.5 rounded px-1 py-0.5 text-left text-[11px] text-secondary enabled:cursor-pointer enabled:hover:bg-hover enabled:hover:text-fg disabled:cursor-default"
        :disabled="!inGrid(cell)"
        :data-tip="inGrid(cell) ? t('githubBoard.jump') : t('githubBoard.notInGrid')"
        @click="jump(cell)"
      >
        <span class="h-[7px] w-[7px] flex-none rounded-full" :class="CELL_DOT[cellState(cell)]" />
        <span class="flex-none">{{ t(`githubBoard.cell.${cellState(cell)}`) }}</span>
        <span class="min-w-0 truncate font-mono text-dim">{{ homeRelative(cell.cwd, home) }}</span>
      </button>
    </li>
  </ul>
</template>
