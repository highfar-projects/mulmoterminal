// What a pack shows a person in another language: an overlay (`locales/en.json` in the pack) that replaces the text of
// its title, questions, steps and examples, and never a value. An option keeps the value the checks compare and the
// answers record; only the words the form shows for it change. So a pack is still run exactly as written.
import { z } from "zod";
import type { BlueprintManifest } from "./manifest.js";
import type { Hearing, HearingQuestion } from "./hearing.js";
import type { ComposedStep } from "./plan.js";
import type { Preset } from "./presets.js";

const text = z.string().min(1);
const titled = z.object({ title: text.optional(), description: text.optional() }).strict();

export const packLocaleSchema = z
  .object({
    manifest: titled.optional(),
    hearing: z
      .record(z.string(), z.object({ label: text.optional(), why: text.optional(), options: z.record(z.string(), text).optional() }).strict())
      .optional(),
    steps: z.record(z.string(), titled).optional(),
    presets: z.record(z.string(), titled).optional(),
  })
  .strict();

export type PackLocale = z.infer<typeof packLocaleSchema>;

/** The overlay a screen language reads: Japanese is what the packs are written in, every other language reads English. */
export const overlayLanguage = (screenLanguage: string | undefined): "en" | null => (screenLanguage === undefined || screenLanguage === "ja" ? null : "en");

type Titled = z.infer<typeof titled>;

// The title and description in the overlay's words where it has them; what the pack wrote where it has not.
const withWords = <T extends { title: string; description?: string }>(target: T, words: Titled | undefined): T => ({
  ...target,
  ...(words?.title ? { title: words.title } : {}),
  ...(words?.description ? { description: words.description } : {}),
});

export const localizedManifest = (manifest: BlueprintManifest, overlay: PackLocale | null): BlueprintManifest => withWords(manifest, overlay?.manifest);

function localizedQuestion(question: HearingQuestion, overlay: PackLocale | null): HearingQuestion {
  const words = overlay?.hearing?.[question.id];
  if (!words) return question;
  return {
    ...question,
    ...(words.label ? { label: words.label } : {}),
    ...(words.why ? { why: words.why } : {}),
    ...(words.options ? { optionLabels: words.options } : {}),
  };
}

export const localizedHearing = (hearing: Hearing, overlay: PackLocale | null): Hearing => ({
  questions: hearing.questions.map((question) => localizedQuestion(question, overlay)),
});

// A usecase may write a step once per base under one id; its words for one base are keyed `<id>@<base>`.
const stepKey = (id: string, base: string): string => `${id}@${base}`;

/**
 * Each step in the words of the pack that wrote it — a base step from the base's overlay, a usecase step from the
 * usecase's — taking the words written for this base (`<id>@<base>`) before the step's own.
 */
export const localizedSteps = (
  steps: readonly ComposedStep[],
  overlays: { base: PackLocale | null; usecase: PackLocale | null },
  baseSlug: string,
): ComposedStep[] =>
  steps.map((step) => {
    const words = (step.origin === "base" ? overlays.base : overlays.usecase)?.steps;
    return withWords(step, words?.[stepKey(step.id, baseSlug)] ?? words?.[step.id]);
  });

export const localizedPreset = <P extends Preset>(preset: P, overlay: PackLocale | null): P => withWords(preset, overlay?.presets?.[preset.id]);

/** Something of the pack that has words to show: a step or an example, with the description it was written with. */
export interface Described {
  id: string;
  title?: string | undefined;
  description?: string | undefined;
  /** For a usecase step written once per base: the bases this one is for. */
  bases?: readonly string[] | undefined;
}

const wordsProblems = (kind: string, name: string, item: Described, found: Titled): string[] => [
  ...(found.title ? [] : [`${kind} "${name}" has no title`]),
  ...(item.description && !found.description ? [`${kind} "${name}" has no description`] : []),
];

/**
 * The steps' words: each step needs them for every base it is written for — under `<id>@<base>`, or under `<id>` when
 * every version of that id says the same thing in the pack — and no key names a step or base the pack does not have.
 */
function stepProblems(steps: readonly Described[], words: Readonly<Record<string, Titled>> | undefined): string[] {
  const same = (id: string): boolean => new Set(steps.filter((step) => step.id === id).map((step) => `${step.title}\n${step.description}`)).size <= 1;
  const missing = steps.flatMap((step) =>
    (step.bases ?? [null]).flatMap((base) => {
      const name = base === null ? step.id : stepKey(step.id, base);
      const found = words?.[name] ?? (same(step.id) ? words?.[step.id] : undefined);
      if (found) return wordsProblems("step", name, step, found);
      return [same(step.id) ? `no words for step "${step.id}"` : `no words for step "${name}" (its steps differ by base)`];
    }),
  );
  // Every key the overlay may use, matched whole: `<id>` for a step the same on every base, `<id>@<base>` for each base.
  const keys = new Set(
    steps.flatMap((step) => [...(same(step.id) || !step.bases ? [step.id] : []), ...(step.bases ?? []).map((base) => stepKey(step.id, base))]),
  );
  const known = (key: string): boolean => keys.has(key);
  const stale = Object.keys(words ?? {})
    .filter((key) => !known(key))
    .map((key) => `words for step "${key}", which the pack does not have`);
  return [...new Set(missing), ...stale];
}

/**
 * What an overlay names that the pack does not have, or leaves out: a question, option, step or example of the pack
 * with no words, words for one it has not, or a title or description the pack has and the overlay does not. Empty
 * when the overlay covers the pack exactly — so nothing on the form falls back to the pack's own language.
 */
export function overlayProblems(
  overlay: PackLocale,
  pack: { manifest: BlueprintManifest; hearing: Hearing | null; steps: readonly Described[]; presets: readonly Described[] },
): string[] {
  const problems: string[] = [];
  if (!overlay.manifest?.title) problems.push("no title");
  if (pack.manifest.description && !overlay.manifest?.description) problems.push("no description");
  const named = (kind: string, have: readonly string[], words: Readonly<Record<string, unknown>> | undefined) => {
    have.filter((id) => !words?.[id]).forEach((id) => problems.push(`no words for ${kind} "${id}"`));
    Object.keys(words ?? {})
      .filter((id) => !have.includes(id))
      .forEach((id) => problems.push(`words for ${kind} "${id}", which the pack does not have`));
  };
  named("question", pack.hearing?.questions.map((question) => question.id) ?? [], overlay.hearing);
  const described = (kind: string, have: readonly Described[], words: Readonly<Record<string, Titled>> | undefined) => {
    named(kind, [...new Set(have.map((item) => item.id))], words);
    have.forEach((item) => {
      const found = words?.[item.id];
      if (found) problems.push(...wordsProblems(kind, item.id, item, found));
    });
  };
  problems.push(...stepProblems(pack.steps, overlay.steps));
  described("example", pack.presets, overlay.presets);
  pack.hearing?.questions.forEach((question) => {
    const words = overlay.hearing?.[question.id];
    if (words && (!words.label || !words.why)) problems.push(`question "${question.id}" needs both a label and a why`);
    named(`option of "${question.id}"`, question.options ?? [], words?.options);
  });
  return problems;
}
