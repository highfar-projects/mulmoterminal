import type { HearingAnswers } from "../../../common/blueprint/hearing";
import type { PackList } from "../../composables/blueprintsApi";

export interface NextOption {
  readonly usecase: string;
  readonly title: string;
  readonly answers: HearingAnswers;
}

/** What a finished build may go on to: the next steps its usecase names that are installed and sit on its base. */
export function nextOptions(packs: PackList, pair: { base: string; usecase: string }): NextOption[] {
  const finished = packs.find((pack) => pack.slug === pair.usecase)?.manifest;
  if (finished?.kind !== "usecase") return [];
  return finished.next.flatMap((step) => {
    const target = packs.find((pack) => pack.slug === step.usecase)?.manifest;
    return target?.kind === "usecase" && target.bases.includes(pair.base) ? [{ usecase: step.usecase, title: target.title, answers: step.answers }] : [];
  });
}

/** The finished usecase's title, for the form to say what it continues; its slug when it is not installed. */
export const usecaseTitle = (packs: PackList, usecase: string): string => packs.find((pack) => pack.slug === usecase)?.manifest.title ?? usecase;
