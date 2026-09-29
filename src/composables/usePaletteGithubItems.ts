// The palette's side of the PR / Issue rows (#2517). `/api/prs` and `/api/issues` run `gh` once per
// configured repo, so the answer is kept for a few minutes rather than asked for on every opening.
import { ref, watch } from "vue";
import { isRecord } from "../../common/isRecord";
import { isUnknownArray } from "../../common/isUnknownArray";
import { jsonBody } from "../jsonBody";
import { fetchWithTimeout, SLOW_COMMAND_TIMEOUT_MS } from "../utils/fetchWithTimeout";
import { isStillFresh, paletteGithubItems, type PaletteGithubItem, type RepoRows } from "./paletteGithubItems";

export const GITHUB_ITEMS_MAX_AGE_MS = 5 * 60 * 1000;

let lastAnswer: { readAt: number; items: PaletteGithubItem[] } | null = null;

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

export function usePaletteGithubItems(offered: () => boolean) {
  const items = ref<PaletteGithubItem[]>([]);
  async function load(): Promise<void> {
    if (lastAnswer && isStillFresh(lastAnswer.readAt, Date.now(), GITHUB_ITEMS_MAX_AGE_MS)) {
      items.value = lastAnswer.items;
      return;
    }
    try {
      const read = await readItems();
      // Only a whole answer is kept: a failed read is asked again on the next opening.
      lastAnswer = { readAt: Date.now(), items: read };
      items.value = read;
    } catch {
      items.value = [];
    }
  }
  // The gate can arrive after the palette opens, so the read waits for it rather than sampling it.
  watch(
    offered,
    (isOffered) => {
      if (isOffered) void load();
      else items.value = [];
    },
    { immediate: true },
  );
  return { items };
}
