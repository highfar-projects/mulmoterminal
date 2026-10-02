// The options a step's agent offers with a question: `$CHOICES` one per line, `label: what it costs
// and risks`, and `$RECOMMEND` naming one label. Prose, not JSON, because the agent writes it inside
// single quotes in a shell line, as it does the question.
import { z } from "zod";

export const MAX_ASK_CHOICES = 6;
const MAX_LABEL_LENGTH = 80;
const LABEL_SEPARATOR_RE = /[:：]/;
// A literal `\n` too: inside single quotes in a shell line it is two characters, not a line break.
const CHOICE_BREAK_RE = /\r?\n|\\n/;

export const askChoiceSchema = z.object({
  label: z.string().min(1),
  description: z.string().optional(),
  recommended: z.literal(true).optional(),
});

export type AskChoice = z.infer<typeof askChoiceSchema>;

export type ParsedChoices = { ok: true; choices: AskChoice[] } | { ok: false; reason: string };

function choiceOfLine(line: string): AskChoice {
  const separator = line.search(LABEL_SEPARATOR_RE);
  if (separator === -1) return { label: line };
  const label = line.slice(0, separator).trim();
  const description = line.slice(separator + 1).trim();
  return description === "" ? { label } : { label, description };
}

function choicesProblem(choices: readonly AskChoice[]): string | null {
  if (choices.length === 1) return "offer at least two choices, or none";
  if (choices.length > MAX_ASK_CHOICES) return `offer at most ${MAX_ASK_CHOICES} choices`;
  if (choices.some(({ label }) => label === "")) return "every choice needs a label before its ':'";
  if (choices.some(({ label }) => label.length > MAX_LABEL_LENGTH)) return `a choice's label is at most ${MAX_LABEL_LENGTH} characters`;
  const labels = choices.map(({ label }) => label);
  return new Set(labels).size === labels.length ? null : "two choices have the same label";
}

function withRecommendation(choices: AskChoice[], recommend: string): ParsedChoices {
  if (!choices.some(({ label }) => label === recommend)) return { ok: false, reason: `RECOMMEND "${recommend}" is not one of the choices' labels` };
  return { ok: true, choices: choices.map((choice) => (choice.label === recommend ? { ...choice, recommended: true } : choice)) };
}

/** The choices `$CHOICES` and `$RECOMMEND` describe, or why the agent must ask again. No choices is a plain question. */
export function parseAskChoices(rawChoices: string | undefined, rawRecommend: string | undefined): ParsedChoices {
  const lines = (rawChoices ?? "")
    .split(CHOICE_BREAK_RE)
    .map((line) => line.trim())
    .filter((line) => line !== "");
  const choices = lines.map(choiceOfLine);
  const problem = choicesProblem(choices);
  if (problem) return { ok: false, reason: problem };
  const recommend = rawRecommend?.trim() ?? "";
  if (recommend === "") return { ok: true, choices };
  if (choices.length === 0) return { ok: false, reason: "RECOMMEND needs CHOICES to pick from" };
  return withRecommendation(choices, recommend);
}
