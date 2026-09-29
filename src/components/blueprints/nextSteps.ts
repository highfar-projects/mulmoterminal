import type { HearingAnswers } from "../../../common/blueprint/hearing";
import type { NextStep } from "../../../common/blueprint/manifest";
import type { PackList } from "../../composables/blueprintsApi";

export interface NextOption {
  readonly usecase: string;
  readonly title: string;
  readonly answers: HearingAnswers;
}

// The finished build's answers a step carries over, under the next usecase's question ids; one it never gave is left out.
const carried = (step: NextStep, finishedAnswers: HearingAnswers): HearingAnswers =>
  Object.fromEntries(
    Object.entries(step.carry).flatMap(([to, from]) => {
      const answer = finishedAnswers[from];
      return answer === undefined ? [] : [[to, answer]];
    }),
  );

/**
 * What a finished build may go on to: the next steps its usecase names that are installed and sit on its base, with
 * the answers each fills in — a fixed answer over a carried one when both name a question.
 */
export function nextOptions(packs: PackList, pair: { base: string; usecase: string }, finishedAnswers: HearingAnswers = {}): NextOption[] {
  const finished = packs.find((pack) => pack.slug === pair.usecase)?.manifest;
  if (finished?.kind !== "usecase") return [];
  return finished.next.flatMap((step) => {
    const target = packs.find((pack) => pack.slug === step.usecase)?.manifest;
    return target?.kind === "usecase" && target.bases.includes(pair.base)
      ? [{ usecase: step.usecase, title: target.title, answers: { ...carried(step, finishedAnswers), ...step.answers } }]
      : [];
  });
}

/** The finished usecase's title, for the form to say what it continues; its slug when it is not installed. */
export const usecaseTitle = (packs: PackList, usecase: string): string => packs.find((pack) => pack.slug === usecase)?.manifest.title ?? usecase;
