<script setup lang="ts">
// One card on the GitHub board (#3172): the issue, the PR that closes it, where it stands in review,
// and the live terminals on its branch. Pressing the card opens its detail panel (#3177); GitHub is
// reached from there.
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import type { BoardCard } from "../../common/githubBoard";
import { ciDotClass } from "./ciDot";
import GithubBoardCells from "./GithubBoardCells.vue";

const props = defineProps<{ card: BoardCard; home: string | null; selected: boolean }>();

const emit = defineEmits<{ (e: "select"): void }>();

const { t } = useI18n();

const review = computed(() => (props.card.pr?.review ?? "").toUpperCase());
</script>

<template>
  <article
    data-testid="board-card"
    class="flex flex-col gap-1.5 rounded-md border bg-panel px-2.5 py-2 text-[12px] text-secondary"
    :class="selected ? 'border-accent' : 'border-border'"
  >
    <button
      type="button"
      data-testid="board-card-open"
      class="flex min-w-0 cursor-pointer flex-col gap-1.5 border-0 bg-transparent p-0 text-left text-[12px] text-secondary hover:text-fg"
      :aria-expanded="selected"
      :aria-label="t('githubBoard.detail.open')"
      @click="emit('select')"
    >
      <span v-if="card.issue" class="flex w-full min-w-0 gap-1.5 text-fg">
        <span class="flex-none font-mono text-dim">#{{ card.issue.number }}</span>
        <span v-if="card.issue.title" class="min-w-0 truncate">{{ card.issue.title }}</span>
      </span>
      <span v-if="card.pr" class="flex w-full min-w-0 items-center gap-1.5" :class="card.issue ? 'text-secondary' : 'text-fg'">
        <span
          class="h-[8px] w-[8px] flex-none rounded-full"
          :class="ciDotClass(card.pr.ci)"
          role="img"
          :aria-label="t(`githubBoard.ci.${card.pr.ci}`)"
          :data-tip="t(`githubBoard.ci.${card.pr.ci}`)"
        />
        <span class="flex-none font-mono text-dim">PR #{{ card.pr.number }}</span>
        <span class="min-w-0 truncate">{{ card.pr.title }}</span>
      </span>
      <span v-if="card.branch" class="w-full truncate font-mono text-[11px] text-dim">⎇ {{ card.branch }}</span>
    </button>
    <div v-if="card.pr" class="flex flex-wrap items-center gap-1 text-[11px]">
      <span v-if="card.pr.isDraft" class="rounded border border-border px-1.5 text-muted">{{ t("githubBoard.draft") }}</span>
      <span v-if="review === 'CHANGES_REQUESTED'" class="rounded border border-err-text px-1.5 text-err-text">{{ t("githubBoard.changesRequested") }}</span>
      <span v-if="review === 'APPROVED'" class="rounded border border-[#3fae6b] px-1.5 text-[#3fae6b]">{{ t("githubBoard.approved") }}</span>
      <span v-if="card.pr.reviewRounds > 0" data-testid="board-review-round" class="rounded border border-border px-1.5 text-muted">{{
        t("githubBoard.reviewRound", { count: card.pr.reviewRounds })
      }}</span>
      <span v-if="card.column === 'review' && !card.pr.headReviewed" class="text-dim">{{ t("githubBoard.awaitingReview") }}</span>
    </div>
    <GithubBoardCells v-if="card.cells.length" :cells="card.cells" :home="home" />
    <div v-else-if="card.column !== 'todo' && card.column !== 'merged'" class="text-[11px] text-dim">{{ t("githubBoard.noCell") }}</div>
  </article>
</template>
