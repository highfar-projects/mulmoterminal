<script setup lang="ts">
// The experimental GitHub board (#3172): per configured repo, five progress columns of cards from
// /api/github/board. Fetched when it mounts and on the reload button; the column rules are the
// server's (server/git/board.ts).
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { BOARD_COLUMNS, type BoardCard, type BoardColumn, type RepoBoard } from "../../common/githubBoard";
import { isRecord } from "../../common/isRecord";
import { isUnknownArray } from "../../common/isUnknownArray";
import { jsonBody } from "../jsonBody";
import { fetchWithTimeout, SLOW_COMMAND_TIMEOUT_MS } from "../utils/fetchWithTimeout";
import { useAppConfig } from "../composables/useAppConfig";
import GithubBoardCard from "./GithubBoardCard.vue";
import GithubBoardDetail from "./GithubBoardDetail.vue";
import { boardSelection, type BoardSelection } from "../composables/useGithubBoardView";

const emit = defineEmits<{ (e: "close" | "list"): void }>();

const { t } = useI18n();
const { home } = useAppConfig();

const repos = ref<RepoBoard[]>([]);
const loading = ref(false);
const failed = ref(false);
let requestId = 0;

const isRepoBoard = (row: unknown): row is RepoBoard => isRecord(row) && typeof row.repo === "string";

async function load(): Promise<void> {
  const id = ++requestId;
  loading.value = true;
  try {
    const res = await fetchWithTimeout("/api/github/board", {}, SLOW_COMMAND_TIMEOUT_MS);
    const body = await jsonBody(res);
    if (id !== requestId) return;
    const rows = res.ok && isRecord(body) && isUnknownArray(body.repos) ? body.repos : null;
    failed.value = rows === null;
    repos.value = rows?.filter(isRepoBoard) ?? [];
  } catch {
    if (id === requestId) failed.value = true;
  } finally {
    if (id === requestId) loading.value = false;
  }
}

const cardsIn = (repo: RepoBoard, column: BoardColumn): BoardCard[] => (repo.cards ?? []).filter((card) => card.column === column);

const isSelected = (repo: RepoBoard, card: BoardCard): boolean => boardSelection.value?.repo === repo.repo && boardSelection.value.key === card.key;

const select = (repo: RepoBoard, card: BoardCard): void => {
  boardSelection.value = isSelected(repo, card) ? null : { repo: repo.repo, key: card.key };
};

const selectedCard = (selection: BoardSelection | null): BoardCard | null =>
  repos.value.find((repo) => repo.repo === selection?.repo)?.cards?.find((candidate) => candidate.key === selection?.key) ?? null;

// Looked up in the latest load, so the panel follows a card's cells across a refresh.
const selected = computed(() => {
  const card = selectedCard(boardSelection.value);
  return boardSelection.value && card ? { repo: boardSelection.value.repo, card } : null;
});

// A card that has left the board takes its panel with it, so Escape is not spent on a hidden one.
watch(repos, () => {
  if (boardSelection.value && !selectedCard(boardSelection.value)) boardSelection.value = null;
});

onMounted(() => void load());
onBeforeUnmount(() => (boardSelection.value = null));
</script>

<template>
  <div class="flex h-full min-h-0 min-w-0 flex-col bg-deep" role="region" :aria-label="t('githubBoard.region')">
    <header class="flex flex-none items-center gap-2.5 border-b border-border bg-panel px-4 py-2">
      <span class="text-[14px] font-[650] text-fg">{{ t("githubBoard.title") }}</span>
      <span class="rounded border border-amber px-1.5 text-[11px] text-amber">{{ t("githubBoard.experimental") }}</span>
      <button
        type="button"
        class="h-6 w-[26px] cursor-pointer rounded-md border border-border bg-base text-[14px] text-secondary enabled:hover:bg-hover enabled:hover:text-fg disabled:cursor-default disabled:opacity-50"
        :disabled="loading"
        :data-tip="t('githubBoard.refresh')"
        :aria-label="t('githubBoard.refresh')"
        @click="load"
      >
        <span class="material-symbols-outlined" aria-hidden="true">refresh</span>
      </button>
      <span v-if="loading" class="text-[12px] text-muted">{{ t("githubBoard.loading") }}</span>
      <div class="ml-auto flex items-center gap-1">
        <button
          type="button"
          class="h-6 cursor-pointer rounded-md border border-border bg-base px-2 text-[12px] text-secondary hover:bg-hover hover:text-fg"
          @click="emit('list')"
        >
          {{ t("githubBoard.back") }}
        </button>
        <button
          type="button"
          class="h-6 w-[26px] cursor-pointer rounded-md border border-border bg-base text-[14px] text-secondary hover:bg-hover hover:text-fg"
          :data-tip="t('githubBoard.close')"
          :aria-label="t('githubBoard.close')"
          @click="emit('close')"
        >
          <span class="material-symbols-outlined" aria-hidden="true">close</span>
        </button>
      </div>
    </header>
    <div class="flex min-h-0 min-w-0 flex-auto">
      <div class="min-w-0 flex-auto overflow-auto px-4 pb-16 pt-3">
        <p class="mb-3 text-[12px] text-muted">{{ t("githubBoard.rule") }}</p>
        <p v-if="failed" class="px-1 py-6 text-[13px] text-err">{{ t("githubBoard.loadFailed") }}</p>
        <p v-else-if="!loading && repos.length === 0" class="px-1 py-6 text-[13px] text-muted">{{ t("githubBoard.noRepos") }}</p>
        <section v-for="repo in repos" :key="repo.repo" data-testid="board-repo" class="mb-6">
          <h3 class="my-1.5 border-b border-border pb-1 font-mono text-[13px] font-semibold text-fg">{{ repo.repo }}</h3>
          <p v-if="repo.error" class="px-1 py-3 text-[13px] text-err">{{ repo.error }}</p>
          <div v-else class="grid min-w-[900px] grid-cols-5 gap-2.5">
            <div
              v-for="column in BOARD_COLUMNS"
              :key="column"
              :data-testid="`board-column-${column}`"
              class="flex min-w-0 flex-col gap-1.5 rounded-md bg-base p-2"
            >
              <div class="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.06em] text-muted">
                {{ t(`githubBoard.column.${column}`) }}
                <span class="font-normal">{{ cardsIn(repo, column).length }}</span>
              </div>
              <GithubBoardCard
                v-for="card in cardsIn(repo, column)"
                :key="card.key"
                :card="card"
                :home="home"
                :selected="isSelected(repo, card)"
                @select="select(repo, card)"
              />
              <span v-if="cardsIn(repo, column).length === 0" class="text-[11px] text-dim">{{ t("githubBoard.empty") }}</span>
            </div>
          </div>
        </section>
      </div>
      <GithubBoardDetail v-if="selected" :repo="selected.repo" :card="selected.card" :home="home" @close="boardSelection = null" />
    </div>
  </div>
</template>
