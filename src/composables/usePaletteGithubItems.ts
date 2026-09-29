// The palette's side of the PR / Issue rows (#2517). `/api/prs` and `/api/issues` run `gh` once per
// configured repo, so the answer is kept for a few minutes rather than asked for on every opening.
import { ref, watch } from "vue";
import { isRecord } from "../../common/isRecord";
import { isUnknownArray } from "../../common/isUnknownArray";
import { jsonBody } from "../jsonBody";
import { fetchWithTimeout, SLOW_COMMAND_TIMEOUT_MS } from "../utils/fetchWithTimeout";
import { isStillFresh, paletteGithubItems, type PaletteGithubItem, type RepoRows } from "./paletteGithubItems";

export const GITHUB_ITEMS_MAX_AGE_MS = 5 * 60 * 1000;

// Kept per set of repos: an answer read for the repos as they were must not stand for new ones.
let lastAnswer: { repos: string; readAt: number; items: PaletteGithubItem[] } | null = null;
// Reads overlap (a reopened palette, a repo list edited mid-read); only the newest may land.
let newestRead = 0;

const hasRepo = (row: unknown): row is { repo: string } & Record<string, unknown> => isRecord(row) && typeof row.repo === "string";

// Each repo's list as the pure side wants it, its rows left for it to check one by one.
const rowsUnder =
  (key: "prs" | "issues") =>
  (repo: { repo: string } & Record<string, unknown>): RepoRows => {
    const rows = repo[key];
    return { repo: repo.repo, rows: isUnknownArray(rows) ? rows : [] };
  };

async function reposFrom(path: string): Promise<({ repo: string } & Record<string, unknown>)[]> {
  const res = await fetchWithTimeout(path, undefined, SLOW_COMMAND_TIMEOUT_MS);
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
  const data = await jsonBody(res);
  return isUnknownArray(data.repos) ? data.repos.filter(hasRepo) : [];
}

async function readItems(): Promise<PaletteGithubItem[]> {
  const [prs, issues] = await Promise.all([reposFrom("/api/prs"), reposFrom("/api/issues")]);
  return paletteGithubItems(prs.map(rowsUnder("prs")), issues.map(rowsUnder("issues")));
}

/** Forget the kept answer; for specs. */
export function forgetGithubItems(): void {
  lastAnswer = null;
}

interface GithubItemSources {
  /** Whether the GitHub view is offered at all (the toolbar's gate). */
  offered: () => boolean;
  /** The configured repos, as one comparable string. */
  repos: () => string;
}

export function usePaletteGithubItems({ offered, repos }: GithubItemSources) {
  const items = ref<PaletteGithubItem[]>([]);
  async function load(forRepos: string): Promise<void> {
    if (lastAnswer && lastAnswer.repos === forRepos && isStillFresh(lastAnswer.readAt, Date.now(), GITHUB_ITEMS_MAX_AGE_MS)) {
      items.value = lastAnswer.items;
      return;
    }
    const read = ++newestRead;
    try {
      const answer = await readItems();
      if (read !== newestRead) return;
      // Only a whole answer is kept: a failed read is asked again on the next opening.
      lastAnswer = { repos: forRepos, readAt: Date.now(), items: answer };
      if (offered() && repos() === forRepos) items.value = answer;
    } catch {
      if (read === newestRead) items.value = [];
    }
  }
  // The gate and the repos can arrive after the palette opens, so the read follows them.
  watch(
    [offered, repos],
    ([isOffered, forRepos]) => {
      if (isOffered) void load(forRepos);
      else items.value = [];
    },
    { immediate: true },
  );
  return { items };
}
