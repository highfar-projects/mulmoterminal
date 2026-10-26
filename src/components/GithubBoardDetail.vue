<script setup lang="ts">
// A board card's detail panel (#3177): the issue's body, the PR's checks and reviews, and the cells on
// its branch, read from /api/github/board/detail when a card is chosen. GitHub is one link here,
// not where the card sends you.
import { ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import type { BoardCard, BoardDetailResponse } from "../../common/githubBoard";
import { isRecord } from "../../common/isRecord";
import { safeHttpsUrl } from "../../common/httpsUrl";
import { jsonBody } from "../jsonBody";
import { fetchWithTimeout, SLOW_COMMAND_TIMEOUT_MS } from "../utils/fetchWithTimeout";
import { ciDotClass } from "./ciDot";
import GithubBoardCells from "./GithubBoardCells.vue";
import GithubBoardCellReply from "./GithubBoardCellReply.vue";
import MarkdownProse from "./MarkdownProse.vue";

const props = defineProps<{ repo: string; card: BoardCard; home: string | null }>();

const emit = defineEmits<{ (e: "close"): void }>();

const { t } = useI18n();

const detail = ref<BoardDetailResponse | null>(null);
const loading = ref(false);
const failed = ref(false);
let requestId = 0;

const isDetail = (body: unknown): body is BoardDetailResponse => isRecord(body) && "issue" in body && "pr" in body && Array.isArray(body.errors);

// Every link in the panel comes from GitHub data, and a status check's `targetUrl` is whatever the
// integration that posted it wrote — so each is made safe once, here, before anything binds it.
const linkable = (url: string): string => safeHttpsUrl(url) ?? "";

const withSafeLinks = (body: BoardDetailResponse): BoardDetailResponse => ({
  ...body,
  issue: body.issue && { ...body.issue, url: linkable(body.issue.url) },
  pr: body.pr && { ...body.pr, url: linkable(body.pr.url), checks: body.pr.checks.map((check) => ({ ...check, url: linkable(check.url) })) },
});

const detailUrl = (card: BoardCard): string => {
  const query = new URLSearchParams({ repo: props.repo });
  if (card.issue) query.set("issue", String(card.issue.number));
  if (card.pr) query.set("pr", String(card.pr.number));
  return `/api/github/board/detail?${query.toString()}`;
};

async function load(card: BoardCard): Promise<void> {
  const id = ++requestId;
  loading.value = false;
  detail.value = null;
  failed.value = false;
  // A cell on a branch with no PR and no issue has nothing on GitHub to read.
  if (!card.issue && !card.pr) return;
  loading.value = true;
  try {
    const res = await fetchWithTimeout(detailUrl(card), {}, SLOW_COMMAND_TIMEOUT_MS);
    const body = await jsonBody(res);
    if (id !== requestId) return;
    detail.value = res.ok && isDetail(body) ? withSafeLinks(body) : null;
    failed.value = detail.value === null;
  } catch {
    if (id === requestId) failed.value = true;
  } finally {
    if (id === requestId) loading.value = false;
  }
}

// Read again only when the panel moves to another card, not on every board refresh of this one.
watch(
  () => `${props.repo}/${props.card.key}`,
  () => void load(props.card),
  { immediate: true },
);

const REVIEW_TONE: Record<string, string> = { APPROVED: "text-[#3fae6b]", CHANGES_REQUESTED: "text-err-text" };
</script>

<template>
  <aside
    data-testid="board-detail"
    class="flex min-h-0 w-[440px] max-w-[50vw] flex-none flex-col border-l border-border bg-panel"
    :aria-label="t('githubBoard.detail.region')"
  >
    <header class="flex flex-none items-center gap-2 border-b border-border px-3 py-2">
      <span class="min-w-0 flex-auto truncate text-[13px] font-semibold text-fg">{{ card.issue?.title || card.pr?.title || card.branch }}</span>
      <button
        type="button"
        class="h-6 w-[26px] flex-none cursor-pointer rounded-md border border-border bg-base text-[14px] text-secondary hover:bg-hover hover:text-fg"
        :data-tip="t('githubBoard.detail.close')"
        :aria-label="t('githubBoard.detail.close')"
        @click="emit('close')"
      >
        <span class="material-symbols-outlined" aria-hidden="true">close</span>
      </button>
    </header>
    <div class="min-h-0 flex-auto overflow-auto px-3 py-2 text-[12px] text-secondary">
      <p v-if="loading" class="text-muted">{{ t("githubBoard.loading") }}</p>
      <p v-else-if="failed" class="text-err">{{ t("githubBoard.detail.loadFailed") }}</p>
      <p v-for="error in detail?.errors ?? []" :key="error" class="text-err">{{ error }}</p>

      <section v-if="card.cells.length" class="mb-3">
        <h4 class="mb-1 text-[11px] font-bold uppercase tracking-[0.06em] text-muted">{{ t("githubBoard.detail.cells") }}</h4>
        <div v-for="cell in card.cells" :key="cell.session" class="mb-2.5 flex flex-col gap-1">
          <GithubBoardCells :cells="[cell]" :home="home" />
          <GithubBoardCellReply :cell="cell" />
        </div>
      </section>

      <section v-if="detail?.pr" data-testid="board-detail-pr" class="mb-3">
        <h4 class="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.06em] text-muted">
          PR #{{ detail.pr.number }}
          <a
            v-if="detail.pr.url"
            class="ml-auto font-normal normal-case tracking-normal text-secondary hover:text-fg"
            :href="detail.pr.url"
            target="_blank"
            rel="noopener noreferrer"
            >{{ t("githubBoard.detail.openOnGithub") }}</a
          >
        </h4>
        <p class="mb-1 text-fg">{{ detail.pr.title }}</p>
        <p class="mb-2 text-[11px] text-dim">
          {{ t("githubBoard.detail.by", { author: detail.pr.author }) }}
          <span class="font-mono">+{{ detail.pr.additions }} −{{ detail.pr.deletions }}</span>
          <span v-if="detail.pr.isDraft"> · {{ t("githubBoard.draft") }}</span>
        </p>
        <h5 class="mb-0.5 text-[11px] text-muted">{{ t("githubBoard.detail.checks") }}</h5>
        <ul v-if="detail.pr.checks.length" class="m-0 mb-2 flex list-none flex-col gap-0.5 p-0">
          <li
            v-for="(check, index) in detail.pr.checks"
            :key="`${index}-${check.name}`"
            data-testid="board-detail-check"
            class="flex min-w-0 items-center gap-1.5"
          >
            <span class="h-[7px] w-[7px] flex-none rounded-full" :class="ciDotClass(check.ci)" role="img" :aria-label="t(`githubBoard.ci.${check.ci}`)" />
            <a v-if="check.url" class="min-w-0 truncate text-secondary hover:text-fg" :href="check.url" target="_blank" rel="noopener noreferrer">{{
              check.name
            }}</a>
            <span v-else class="min-w-0 truncate">{{ check.name }}</span>
          </li>
        </ul>
        <p v-else class="mb-2 text-dim">{{ t("githubBoard.ci.none") }}</p>
        <h5 class="mb-0.5 text-[11px] text-muted">{{ t("githubBoard.detail.reviews") }}</h5>
        <ul v-if="detail.pr.reviews.length" class="m-0 mb-2 flex list-none flex-col gap-0.5 p-0">
          <li v-for="(review, index) in detail.pr.reviews" :key="index" data-testid="board-detail-review" class="flex min-w-0 items-center gap-1.5">
            <span class="min-w-0 truncate text-fg">{{ review.author }}</span>
            <span class="flex-none" :class="REVIEW_TONE[review.state] ?? 'text-muted'">{{ review.state }}</span>
            <span v-if="review.commit" class="ml-auto flex-none font-mono text-dim">{{ review.commit }}</span>
          </li>
        </ul>
        <p v-else class="mb-2 text-dim">{{ t("githubBoard.detail.noReviews") }}</p>
        <MarkdownProse v-if="detail.pr.body" :markdown="detail.pr.body" images-as-links class="border-t border-border pt-2 text-[12px] leading-[1.6] text-fg" />
      </section>

      <section v-if="detail?.issue" data-testid="board-detail-issue" class="mb-3">
        <h4 class="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.06em] text-muted">
          {{ t("githubBoard.detail.issue", { number: detail.issue.number }) }}
          <a
            v-if="detail.issue.url"
            class="ml-auto font-normal normal-case tracking-normal text-secondary hover:text-fg"
            :href="detail.issue.url"
            target="_blank"
            rel="noopener noreferrer"
            >{{ t("githubBoard.detail.openOnGithub") }}</a
          >
        </h4>
        <p class="mb-1 text-fg">{{ detail.issue.title }}</p>
        <p class="mb-2 flex flex-wrap items-center gap-1 text-[11px] text-dim">
          {{ t("githubBoard.detail.by", { author: detail.issue.author }) }}
          <span v-for="label in detail.issue.labels" :key="label" class="rounded border border-border px-1.5 text-muted">{{ label }}</span>
        </p>
        <MarkdownProse v-if="detail.issue.body" :markdown="detail.issue.body" images-as-links class="text-[12px] leading-[1.6] text-fg" />
        <p v-else class="text-dim">{{ t("githubBoard.detail.noBody") }}</p>
      </section>
    </div>
  </aside>
</template>
