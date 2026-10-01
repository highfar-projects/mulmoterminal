// The prompt a step's session starts with. Everything the agent needs to act without guessing:
// the skill to follow, what was already asked and answered, why the last attempt failed, and the
// one way it may stop to ask a person.
import type { PlanStep } from "./plan.js";
import type { StepState } from "./state.js";
import { personLanguageLine, type PersonLanguage } from "./personLanguage.js";
import { REPAIR_AFTER } from "./executorPolicy.js";

// Enough of a failing check's output to act on; a build log can run far longer.
export const CHECK_OUTPUT_PROMPT_CHARS = 4000;
// Each earlier failure's output, shorter: what kept failing, not every line of it.
export const EARLIER_FAILURE_PROMPT_CHARS = 1500;
// The person's earlier answers shown to a step, newest kept: a long build with a question every round would otherwise
// grow every later prompt without end.
export const EARLIER_ANSWERS_PROMPT_CHARS = 6000;

export interface StepPromptInput {
  step: PlanStep;
  /** Absolute path of the step's SKILL.md. */
  skillFile: string;
  /** The two packs: their spec/ and security/ templates are what a step writes from. */
  packDirs: { base: string; usecase: string };
  stepState: StepState | undefined;
  /** A shell command that asks the user `$QUESTION` — the executor fills in the run and step. */
  askCommand: string;
  /** What the person decided when earlier steps asked: it can change an interview answer, which the file never learns. */
  earlierAnswers?: readonly EarlierAnswer[];
  /** The language the person reads, when the build recorded it. */
  language?: PersonLanguage | null;
  /** What the step's earlier failed checks printed, oldest first — the attempts before the last one. */
  earlierFailures?: readonly string[];
}

/** A question a person answered while an earlier step, or an earlier round of this one, ran — with where it was asked. */
export interface EarlierAnswer {
  readonly step: string;
  readonly question: string;
  readonly answer: string;
}

const asked = (title: string, round?: number): string => (round === undefined ? title : `${title}, round ${round}`);

function answersOf(step: PlanStep, stepState: StepState | undefined): EarlierAnswer[] {
  const rounds = (stepState?.earlierRounds ?? []).map(({ round, question, answer }) => ({ step: asked(step.title, round), question, answer }));
  const latest = (stepState?.answers ?? []).map(({ question, answer }) => ({
    step: asked(step.title, stepState?.round === undefined ? undefined : stepState.round + 1),
    question,
    answer,
  }));
  return [...rounds, ...latest];
}

/**
 * The answers the person gave before this session: in the steps before `stepId`, in plan order, and in this step's
 * finished rounds. This session's own round is `answeredSection`'s.
 */
export function earlierAnswers(steps: readonly PlanStep[], states: Readonly<Record<string, StepState | undefined>>, stepId: string): EarlierAnswer[] {
  const index = steps.findIndex((step) => step.id === stepId);
  if (index < 0) return [];
  const before = steps.slice(0, index).flatMap((step) => answersOf(step, states[step.id]));
  const own = steps[index];
  const ownRounds = (states[stepId]?.earlierRounds ?? []).map(({ round, question, answer }) => ({
    step: asked(own?.title ?? stepId, round),
    question,
    answer,
  }));
  return [...before, ...ownRounds];
}

const tail = (text: string, chars: number): string => (text.length > chars ? `…${text.slice(-chars)}` : text);

// Newest first while it fits, then shown oldest first: what was decided last is what must not be lost. The newest
// is always kept, however long.
function fitted(lines: readonly string[]): { kept: string[]; left: number } {
  const kept = [...lines]
    .reverse()
    .reduce<{ lines: string[]; chars: number; full: boolean }>(
      (acc, line) =>
        acc.full || (acc.lines.length > 0 && acc.chars + line.length > EARLIER_ANSWERS_PROMPT_CHARS)
          ? { ...acc, full: true }
          : { lines: [line, ...acc.lines], chars: acc.chars + line.length, full: false },
      { lines: [], chars: 0, full: false },
    ).lines;
  return { kept, left: lines.length - kept.length };
}

function answeredSection(stepState: StepState | undefined): string[] {
  const answers = stepState?.answers ?? [];
  if (answers.length === 0) return [];
  return ["", "Already asked and answered — do not ask these again:", ...answers.map(({ question, answer }) => `- Q: ${question}\n  A: ${answer}`)];
}

function earlierSection(earlier: readonly EarlierAnswer[]): string[] {
  if (earlier.length === 0) return [];
  const { kept, left } = fitted(earlier.map(({ step, question, answer }) => `- In "${step}": Q: ${question}\n  A: ${answer}`));
  return [
    "",
    "Decided with the user before this session. Where one of these settles something .blueprint/answers.json also answers, it stands over the file:",
    ...(left > 0 ? [`(${left} older answers left out)`] : []),
    ...kept,
  ];
}

// A repeating step's session does one item of a list; the executor starts the next round itself.
function roundSection(step: PlanStep, stepState: StepState | undefined): string[] {
  if (!step.repeatWhile) return [];
  return [
    "",
    `This step repeats: this is round ${(stepState?.round ?? 0) + 1}. Do exactly ONE item of the work, finish it, and stop. The executor starts the next round in a fresh session while \`${step.repeatWhile}\` exits 0.`,
  ];
}

/**
 * The step's check as a shell would run it from the project, with the pack folders written in: a check names them as
 * `$BLUEPRINT_BASE` / `$BLUEPRINT_USECASE` (bare or braced), which only the executor's own run sets.
 */
export const resolvedCheck = (check: string, packDirs: { base: string; usecase: string }): string =>
  check.replace(/\$\{?BLUEPRINT_(BASE|USECASE)\}?/gu, (_match, which: string) => (which === "BASE" ? packDirs.base : packDirs.usecase));

// A check's output does not always say how to fix what it found, and an agent that cannot tell fails the same way
// until the retries run out and a person — who cannot fix it either — is left with the build. The check itself is
// the exact rule, so the agent is pointed at it; reading has no side effects, where running some checks would.
// The earlier failures, and — once enough attempts in a row have failed — the instruction to stop repeating them.
function repairLines(earlierFailures: readonly string[]): string[] {
  if (earlierFailures.length === 0) return [];
  const attempts = earlierFailures.length + 1;
  const earlier = earlierFailures.flatMap((output, index) => [`Attempt ${index + 1}:`, "```", tail(output, EARLIER_FAILURE_PROMPT_CHARS), "```"]);
  const repair =
    attempts >= REPAIR_AFTER
      ? [
          `This is a repair attempt: ${attempts} attempts in a row have not passed this check, so doing what they did again will not either. Before changing anything, read the check and work out why every attempt still failed — compare what each reported — then fix that cause.`,
        ]
      : [];
  return ["", "Earlier attempts failed this check too. What they reported, oldest first:", ...earlier, ...repair];
}

function failureSection(
  step: PlanStep,
  stepState: StepState | undefined,
  packDirs: { base: string; usecase: string },
  earlierFailures: readonly string[],
): string[] {
  const check = stepState?.lastCheck;
  if (!check || check.ok) return [];
  return [
    ...repairLines(earlierFailures),
    "",
    "The previous attempt did not pass its check. Its output:",
    "```",
    tail(check.output, CHECK_OUTPUT_PROMPT_CHARS),
    "```",
    "Fix what it reports. When the output does not make plain what would satisfy it, read the check to see exactly what it requires — " +
      `it is \`${resolvedCheck(step.check, packDirs)}\`, and the scripts it names are in the pack folders above — then change the work until it would pass. Never change the check or anything in the pack folders.`,
  ];
}

export function stepPrompt({
  step,
  skillFile,
  packDirs,
  stepState,
  askCommand,
  earlierAnswers: earlier = [],
  language,
  earlierFailures = [],
}: StepPromptInput): string {
  return [
    `Blueprint step "${step.id}": ${step.title}.`,
    step.description,
    "",
    `Read and follow ${skillFile}. Read .blueprint/spec.md for the agreed specification.`,
    `The user's interview answers are in .blueprint/answers.json. Base pack: ${packDirs.base}. Usecase pack: ${packDirs.usecase}.`,
    ...personLanguageLine(language),
    "",
    "If you need a decision from the user, run this and then stop — do not guess:",
    `  QUESTION='your question' ${askCommand}`,
    `The user is not an engineer. When they must do something by hand — a console setting, a sign-in, trying the app — use the matching guide in ${packDirs.base}/guides or ${packDirs.usecase}/guides: put its steps in your question with the {{…}} placeholders filled in, rather than a bare link. The question is shown as Markdown.`,
    "",
    `When the work is done, stop. The executor then runs the step's check itself: ${step.check}`,
    "Finish everything within this turn: leave no background task or subagent running when you stop — this session is closed when its turn ends, and the next step may start in the same folder.",
    ...roundSection(step, stepState),
    ...earlierSection(earlier),
    ...answeredSection(stepState),
    ...failureSection(step, stepState, packDirs, earlierFailures),
  ].join("\n");
}
