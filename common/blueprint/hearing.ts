// The interview a usecase pack asks before a spec is written. Each question carries WHY it is
// asked, because the answer decides something that is expensive to change later (a Firestore
// region cannot be moved), and a non-engineer answers better when told what rides on it.
import { z } from "zod";

export const HEARING_KINDS = ["text", "select", "multiselect", "number", "boolean"] as const;

const hearingAnswerSchema = z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]);

// A plain relative path inside the build's folder: no leading "/", no "..", ".", or empty segment, no backslash.
export const isFolderRelativePath = (file: string): boolean =>
  !file.includes("\\") && file.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");

const questionSchema = z.object({
  id: z.string().regex(/^[a-zA-Z]\w{0,63}$/),
  label: z.string().min(1),
  why: z.string().min(1),
  kind: z.enum(HEARING_KINDS),
  options: z.array(z.string().min(1)).optional(),
  required: z.boolean().default(true),
  // A text answer that is a list, one item per line: the form gives it a multi-line field, which keeps the newlines.
  lines: z.boolean().default(false),
  // Where the answer is picked from: "files" — a one-per-line answer whose lines are files in the build's folder;
  // "collection" — one line naming a collection the build starts from, whose copy is placed in the folder;
  // "records" — yes or no, whether that copy takes the collection's records (and the files they point at) too.
  pick: z.enum(["files", "collection", "records"]).optional(),
  // Filled in when the form opens on this interview, so a value most people keep is not asked for; an example or a
  // finished build's hand-over wins over it. Only a value the question itself would take.
  default: hearingAnswerSchema.optional(),
  // Asked only when an earlier answer equals this value.
  showIf: z.object({ id: z.string(), equals: z.union([z.string(), z.boolean(), z.number()]) }).optional(),
  // An option that works only when the build's folder has a file: { option: file }. It is offered only then, and a
  // question left with one option is not asked — that option is the answer.
  needsFile: z.record(z.string(), z.string().min(1)).optional(),
});

export const hearingSchema = z.object({ questions: z.array(questionSchema).min(1) }).superRefine((hearing, ctx) => {
  hearingProblems(hearing.questions).forEach((message) => ctx.addIssue({ code: "custom", message }));
});

export type HearingQuestion = z.infer<typeof questionSchema>;
export type Hearing = z.infer<typeof hearingSchema>;
export const hearingAnswersSchema = z.record(z.string(), hearingAnswerSchema);

export type HearingAnswers = z.infer<typeof hearingAnswersSchema>;
export type HearingAnswer = HearingAnswers[string];

const needsOptions = (question: HearingQuestion): boolean => question.kind === "select" || question.kind === "multiselect";

function needsFileProblems(question: HearingQuestion): string[] {
  if (!question.needsFile) return [];
  const problems: string[] = [];
  const unknownOptions = Object.keys(question.needsFile).filter((option) => !question.options?.includes(option));
  if (unknownOptions.length > 0) problems.push(`"${question.id}" needs a file for options it does not have: ${unknownOptions.join(", ")}`);
  const outside = Object.values(question.needsFile).filter((file) => !isFolderRelativePath(file));
  if (outside.length > 0) problems.push(`"${question.id}" needs files outside the folder: ${outside.join(", ")}`);
  if (question.kind !== "select") problems.push(`"${question.id}" needs a file for an option, which only a select offers`);
  return problems;
}

function questionProblems(question: HearingQuestion, earlier: ReadonlySet<string>): string[] {
  const problems: string[] = [];
  if (earlier.has(question.id)) problems.push(`duplicate question id "${question.id}"`);
  if (needsOptions(question) && !question.options?.length) problems.push(`"${question.id}" is a ${question.kind} with no options`);
  if (question.lines && question.kind !== "text") problems.push(`"${question.id}" is a ${question.kind}, and only a text answer can be one per line`);
  if (question.pick === "files" && !question.lines) problems.push(`"${question.id}" picks files but is not one per line`);
  if (question.pick === "collection" && (question.kind !== "text" || question.lines))
    problems.push(`"${question.id}" picks a collection, which is one line of text`);
  if (question.pick === "records" && question.kind !== "boolean") problems.push(`"${question.id}" decides whether records are copied, which is yes or no`);
  if (question.showIf && !earlier.has(question.showIf.id)) problems.push(`"${question.id}" depends on "${question.showIf.id}", which is not asked before it`);
  problems.push(...needsFileProblems(question));
  const defaultProblem = question.default === undefined ? null : kindProblem(question, question.default);
  if (defaultProblem) problems.push(`"${question.id}" has a default it would refuse: ${defaultProblem}`);
  return problems;
}

/** Structural problems a schema alone cannot see: duplicate ids, a choice with no options,
 *  a condition on a question that is not asked earlier. */
export function hearingProblems(questions: readonly HearingQuestion[]): string[] {
  const seen = new Set<string>();
  const perQuestion = questions.flatMap((question) => {
    const problems = questionProblems(question, seen);
    seen.add(question.id);
    return problems;
  });
  return [...perQuestion, ...sourceProblems(questions)];
}

// A build starts from one source, and whether its records come along is asked once, about that source.
function sourceProblems(questions: readonly HearingQuestion[]): string[] {
  const count = (pick: HearingQuestion["pick"]): number => questions.filter((question) => question.pick === pick).length;
  const [sources, records] = [count("collection"), count("records")];
  return [
    ...(sources > 1 ? [`${sources} questions pick a collection; a build starts from one`] : []),
    ...(records > 1 ? [`${records} questions decide whether records are copied; one decides it`] : []),
    ...(records > 0 && sources === 0 ? ["a question decides whether records are copied, but none picks the collection they come from"] : []),
  ];
}

/** Whether the answers ask for the source's records to be copied too: only a yes to the hearing's records question does. */
export const recordsWanted = (hearing: Hearing, answers: HearingAnswers): boolean => {
  const question = hearing.questions.find((candidate) => candidate.pick === "records");
  return question !== undefined && answers[question.id] === true;
};

/** The question whose answer names the collection a build starts from, if the hearing has one. */
export const sourceQuestion = (hearing: Hearing): HearingQuestion | undefined => hearing.questions.find((question) => question.pick === "collection");

const isBlank = (answer: HearingAnswer | undefined): boolean =>
  answer === undefined || (typeof answer === "string" && answer.trim() === "") || (Array.isArray(answer) && answer.length === 0);

const conditionHolds = (question: HearingQuestion, answers: HearingAnswers, asked: ReadonlySet<string>): boolean =>
  !question.showIf || (asked.has(question.showIf.id) && answers[question.showIf.id] === question.showIf.equals);

/** The questions that apply under the current answers. A condition holds only when the question it
 *  names is itself asked, so a stale answer to a question no longer asked opens nothing. */
export function askedQuestions(hearing: Hearing, answers: HearingAnswers): HearingQuestion[] {
  const asked = new Set<string>();
  return hearing.questions.filter((question) => {
    const applies = conditionHolds(question, answers, asked);
    if (applies) asked.add(question.id);
    return applies;
  });
}

/** The questions still to put to the user: asked under the current answers, required, and blank.
 *  A spec the user already supplied fills `answers` first, so only its gaps are asked. */
export const unansweredQuestions = (hearing: Hearing, answers: HearingAnswers): HearingQuestion[] =>
  askedQuestions(hearing, answers).filter((question) => question.required && isBlank(answers[question.id]));

type KindCheck = { accepts: (answer: HearingAnswer, options: readonly string[]) => boolean; problem: string };

const KIND_CHECKS: Record<(typeof HEARING_KINDS)[number], KindCheck> = {
  boolean: { accepts: (answer) => typeof answer === "boolean", problem: "expects yes or no" },
  number: { accepts: (answer) => typeof answer === "number" && Number.isFinite(answer), problem: "expects a number" },
  text: { accepts: (answer) => typeof answer === "string", problem: "expects text" },
  select: { accepts: (answer, options) => typeof answer === "string" && options.includes(answer), problem: "expects one of its options" },
  multiselect: {
    accepts: (answer, options) => Array.isArray(answer) && answer.every((choice) => options.includes(choice)),
    problem: "expects some of its options",
  },
};

function kindProblem(question: HearingQuestion, answer: HearingAnswer): string | null {
  const check = KIND_CHECKS[question.kind];
  return check.accepts(answer, question.options ?? []) ? null : check.problem;
}

/** Answers of the wrong kind, or choices a question does not offer — each as "id: why". */
export function answerProblems(hearing: Hearing, answers: HearingAnswers): string[] {
  return askedQuestions(hearing, answers).flatMap((question) => {
    const answer = answers[question.id];
    const problem = answer === undefined ? null : kindProblem(question, answer);
    return problem ? [`${question.id}: ${problem}`] : [];
  });
}

/**
 * The answers a hearing takes as they are: each to a question it has, of that question's kind and among its choices.
 * Answers filled in from elsewhere pass through this, so one a pack got wrong is left for the person rather than refused at Start.
 */
export function acceptedAnswers(hearing: Hearing, answers: HearingAnswers): HearingAnswers {
  const questions = new Map(hearing.questions.map((question) => [question.id, question]));
  return Object.fromEntries(
    Object.entries(answers).filter(([id, answer]) => {
      const question = questions.get(id);
      return question !== undefined && kindProblem(question, answer) === null;
    }),
  );
}

/** The answers an interview starts with: each question's default, where it has one. */
export const defaultAnswers = (hearing: Hearing): HearingAnswers =>
  Object.fromEntries(hearing.questions.flatMap((question) => (question.default === undefined ? [] : [[question.id, question.default]])));

/**
 * The defaults a request that leaves them out is given: a required question's only. An optional question left blank
 * was answered "nothing", and a default must not be put back over it.
 */
export const requiredDefaults = (hearing: Hearing): HearingAnswers => defaultAnswers({ questions: hearing.questions.filter((question) => question.required) });

/** Every file some option of `hearing` needs, once each. */
export const neededFiles = (hearing: Hearing): string[] => [...new Set(hearing.questions.flatMap((question) => Object.values(question.needsFile ?? {})))];

/** The options of `question` that can work in a folder where `hasFile(path)` says which files there are. */
export const offeredOptions = (question: HearingQuestion, hasFile: (path: string) => boolean): string[] =>
  (question.options ?? []).filter((option) => {
    const file = question.needsFile?.[option];
    return file === undefined || hasFile(file);
  });

/** The answers the folder settles by itself: a select that needs files and is left with one option there is answered with it. */
export const settledAnswers = (hearing: Hearing, hasFile: (path: string) => boolean): HearingAnswers =>
  Object.fromEntries(
    hearing.questions.flatMap((question) => {
      if (!question.needsFile) return [];
      const offered = offeredOptions(question, hasFile);
      return offered.length === 1 ? [[question.id, offered[0] ?? ""]] : [];
    }),
  );

/** Each asked answer choosing an option whose file the folder lacks, as "id: why". */
export const missingFileProblems = (hearing: Hearing, answers: HearingAnswers, hasFile: (path: string) => boolean): string[] =>
  askedQuestions(hearing, answers).flatMap((question) => {
    const answer = answers[question.id];
    const file = typeof answer === "string" ? question.needsFile?.[answer] : undefined;
    return file !== undefined && !hasFile(file) ? [`${question.id}: 「${answer}」 needs ${file} in the folder, and it has none`] : [];
  });

/** The answers as the folder leaves them: an option it cannot offer is dropped, and a question it settles is answered. */
export const folderAnswers = (hearing: Hearing, answers: HearingAnswers, hasFile: (path: string) => boolean): HearingAnswers => {
  const unoffered = new Set(
    hearing.questions.flatMap((question) => {
      const answer = answers[question.id];
      return typeof answer === "string" && question.needsFile?.[answer] !== undefined && !hasFile(question.needsFile[answer]) ? [question.id] : [];
    }),
  );
  const kept = Object.fromEntries(Object.entries(answers).filter(([id]) => !unoffered.has(id)));
  return { ...kept, ...settledAnswers(hearing, hasFile) };
};
