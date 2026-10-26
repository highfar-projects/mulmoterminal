<script setup lang="ts">
// One card on the GitHub board (#3172): the issue, the PR that closes it, where it stands in review,
// and the live terminals on its branch — each a jump to that cell when the grid holds it.
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import type { BoardCard, BoardCell } from "../../common/githubBoard";
import { ciDotClass } from "./ciDot";
import { gridSessionJump } from "../composables/gridSessionJump";
import { homeRelative } from "./cwdDisplay";

const props = defineProps<{ card: BoardCard; home: string | null }>();

const { t } = useI18n();

const review = computed(() => (props.card.pr?.review ?? "").toUpperCase());

const cellState = (cell: BoardCell): "working" | "waiting" | "idle" => {
  if (cell.waiting) return "waiting";
  return cell.working ? "working" : "idle";
};

const CELL_DOT: Record<"working" | "waiting" | "idle", string> = { working: "bg-[#3fae6b]", waiting: "bg-amber", idle: "bg-dim" };

const inGrid = (cell: BoardCell): boolean => gridSessionJump.value?.has(cell.session) ?? false;

const jump = (cell: BoardCell): void => gridSessionJump.value?.goTo(cell.session);
</script>

<template>
  <article data-testid="board-card" class="flex flex-col gap-1.5 rounded-md border border-border bg-panel px-2.5 py-2 text-[12px] text-secondary">
    <a v-if="card.issue" class="flex min-w-0 gap-1.5 text-fg no-underline hover:underline" :href="card.issue.url" target="_blank" rel="noopener noreferrer">
      <span class="flex-none font-mono text-dim">#{{ card.issue.number }}</span>
      <span v-if="card.issue.title" class="min-w-0 truncate">{{ card.issue.title }}</span>
    </a>
    <a
      v-if="card.pr"
      class="flex min-w-0 items-center gap-1.5 no-underline hover:underline"
      :class="card.issue ? 'text-secondary' : 'text-fg'"
      :href="card.pr.url"
      target="_blank"
      rel="noopener noreferrer"
    >
      <span
        class="h-[8px] w-[8px] flex-none rounded-full"
        :class="ciDotClass(card.pr.ci)"
        role="img"
        :aria-label="t(`githubBoard.ci.${card.pr.ci}`)"
        :data-tip="t(`githubBoard.ci.${card.pr.ci}`)"
      />
      <span class="flex-none font-mono text-dim">PR #{{ card.pr.number }}</span>
      <span class="min-w-0 truncate">{{ card.pr.title }}</span>
    </a>
    <div v-if="card.branch" class="truncate font-mono text-[11px] text-dim">⎇ {{ card.branch }}</div>
    <div v-if="card.pr" class="flex flex-wrap items-center gap-1 text-[11px]">
      <span v-if="card.pr.isDraft" class="rounded border border-border px-1.5 text-muted">{{ t("githubBoard.draft") }}</span>
      <span v-if="review === 'CHANGES_REQUESTED'" class="rounded border border-err-text px-1.5 text-err-text">{{ t("githubBoard.changesRequested") }}</span>
      <span v-if="review === 'APPROVED'" class="rounded border border-[#3fae6b] px-1.5 text-[#3fae6b]">{{ t("githubBoard.approved") }}</span>
      <span v-if="card.pr.reviewRounds > 0" data-testid="board-review-round" class="rounded border border-border px-1.5 text-muted">{{
        t("githubBoard.reviewRound", { count: card.pr.reviewRounds })
      }}</span>
      <span v-if="card.column === 'review' && !card.pr.headReviewed" class="text-dim">{{ t("githubBoard.awaitingReview") }}</span>
    </div>
    <ul v-if="card.cells.length" class="m-0 flex list-none flex-col gap-0.5 p-0">
      <li v-for="cell in card.cells" :key="cell.session">
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
    <div v-else-if="card.column !== 'todo' && card.column !== 'merged'" class="text-[11px] text-dim">{{ t("githubBoard.noCell") }}</div>
  </article>
</template>
