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

/** Each step in the words of the pack that wrote it: a base step from the base's overlay, a usecase step from the usecase's. */
export const localizedSteps = (steps: readonly ComposedStep[], overlays: { base: PackLocale | null; usecase: PackLocale | null }): ComposedStep[] =>
  steps.map((step) => withWords(step, (step.origin === "base" ? overlays.base : overlays.usecase)?.steps?.[step.id]));

export const localizedPreset = <P extends Preset>(preset: P, overlay: PackLocale | null): P => withWords(preset, overlay?.presets?.[preset.id]);

/** Something of the pack that has words to show: a step or an example, with the description it was written with. */
export interface Described {
  id: string;
  description?: string;
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
      if (found && !found.title) problems.push(`${kind} "${item.id}" has no title`);
      if (found && item.description && !found.description) problems.push(`${kind} "${item.id}" has no description`);
    });
  };
  described("step", pack.steps, overlay.steps);
  described("example", pack.presets, overlay.presets);
  pack.hearing?.questions.forEach((question) => {
    const words = overlay.hearing?.[question.id];
    if (words && (!words.label || !words.why)) problems.push(`question "${question.id}" needs both a label and a why`);
    named(`option of "${question.id}"`, question.options ?? [], words?.options);
  });
  return problems;
}
