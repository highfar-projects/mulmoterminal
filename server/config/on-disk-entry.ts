// The halves of a one-entry change that every add route shares: refuse when the build against the
// config on disk names a problem, otherwise append what it built to that list.
import type { AppConfig } from "./app-config.js";
import type { OnDiskChange } from "./agent/agent-entry-routes.js";

type Refusable = { problem: string } | { problem?: undefined; [field: string]: unknown };

export const refuseOnProblem =
  (build: (base: AppConfig) => Refusable) =>
  (base: AppConfig): string | null =>
    build(base).problem ?? null;

type EntryListKey = "customAgents" | "accounts" | "providers";
type EntryOf<K extends EntryListKey> = AppConfig[K][number];

export function appendOnDisk<K extends EntryListKey>(
  key: K,
  build: (base: AppConfig) => { entry: EntryOf<K> } | { problem: string },
): Required<Pick<OnDiskChange, "refuse" | "update">> {
  return {
    refuse: refuseOnProblem(build),
    update: (base) => {
      const built = build(base);
      const list: readonly EntryOf<K>[] = base[key];
      return { [key]: "entry" in built ? [...list, built.entry] : list };
    },
  };
}
