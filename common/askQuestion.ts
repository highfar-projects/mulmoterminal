import { isRecord } from "./isRecord.js";

// The pub/sub channel carrying "this session is asking the user a question". Both sides decide
// from it — the server publishes what the PreToolUse hook reported, the pane listens to know a
// dialog is up and what it offers — so the name and the payload shape live here.
export const ASK_QUESTION_CHANNEL = "ask-question";

/** The tool name whose input this module reads. Claude Code's built-in question dialog. */
export const ASK_QUESTION_TOOL = "AskUserQuestion";

export interface AskOption {
  label: string;
  description?: string;
}

export interface AskQuestion {
  question: string;
  header: string;
  options: AskOption[];
  multiSelect: boolean;
}

export interface AskQuestionEvent {
  sessionId: string;
  toolUseId: string;
  questions: AskQuestion[];
}

/** The same dialog, now answered — in the terminal, in the pane, or cancelled with Esc. The pane
 *  drops its buttons on this: keys aimed at a dialog that has closed would reach the prompt
 *  underneath, where Down walks the input history and Enter would re-submit what it found. */
export interface AskQuestionDone {
  sessionId: string;
  toolUseId: string;
  done: true;
}

const parseOption = (value: unknown): AskOption | null => {
  if (!isRecord(value) || typeof value.label !== "string" || !value.label) return null;
  return typeof value.description === "string" ? { label: value.label, description: value.description } : { label: value.label };
};

const isOption = (value: AskOption | null): value is AskOption => value !== null;

const parseQuestion = (value: unknown): AskQuestion | null => {
  if (!isRecord(value) || typeof value.question !== "string" || !Array.isArray(value.options)) return null;
  const options = value.options.map(parseOption).filter(isOption);
  // Length mismatch means one option failed to parse: answering by index against a list we
  // could not read whole would pick the wrong row, so the whole question is rejected instead.
  if (options.length === 0 || options.length !== value.options.length) return null;
  return { question: value.question, header: typeof value.header === "string" ? value.header : "", options, multiSelect: value.multiSelect === true };
};

const isQuestion = (value: AskQuestion | null): value is AskQuestion => value !== null;

/** Read a PreToolUse `tool_input` for AskUserQuestion. Null when it is not one, or not whole. */
export const parseAskQuestions = (toolInput: unknown): AskQuestion[] | null => {
  if (!isRecord(toolInput) || !Array.isArray(toolInput.questions)) return null;
  const questions = toolInput.questions.map(parseQuestion).filter(isQuestion);
  if (questions.length === 0 || questions.length !== toolInput.questions.length) return null;
  return questions;
};

const identifiesADialog = (data: unknown): data is Record<string, unknown> & { sessionId: string; toolUseId: string } =>
  isRecord(data) && typeof data.sessionId === "string" && typeof data.toolUseId === "string";

export const isAskQuestionEvent = (data: unknown): data is AskQuestionEvent =>
  identifiesADialog(data) && data.done !== true && parseAskQuestions(data) !== null;

export const isAskQuestionDone = (data: unknown): data is AskQuestionDone => identifiesADialog(data) && data.done === true;

const KEY_DOWN = "\x1b[B";
const KEY_ENTER = "\r";

// The dialog lists MORE rows than `options`: a "Type something" row follows them, and a
// multi-select question puts its Submit row after that. So Submit sits at options.length + 1.
// Measured against claude 2.1.231, not inferred from the tool schema — the extra rows exist
// only on screen, and reading the schema alone would aim every multi-select Enter one row short.
const submitRow = (options: readonly AskOption[]): number => options.length + 1;

const moveDown = (from: number, to: number): string[] => Array.from({ length: Math.max(0, to - from) }, () => KEY_DOWN);

// Enter TOGGLES a multi-select row and leaves the cursor where it is, so each pick is
// "walk down to it, toggle", and the walk starts from the previous pick rather than the top.
const toggleEach = (picks: readonly number[]): { keys: string[]; cursor: number } =>
  picks.reduce<{ keys: string[]; cursor: number }>(({ keys, cursor }, idx) => ({ keys: [...keys, ...moveDown(cursor, idx), KEY_ENTER], cursor: idx }), {
    keys: [],
    cursor: 0,
  });

const keysForOne = (question: AskQuestion, picks: readonly number[]): string[] => {
  if (!question.multiSelect) return [...moveDown(0, picks[0] ?? 0), KEY_ENTER];
  const { keys, cursor } = toggleEach(picks);
  return [...keys, ...moveDown(cursor, submitRow(question.options)), KEY_ENTER];
};

// Ascending and distinct, because the walk above only ever moves DOWN: an out-of-order pick
// would silently toggle the wrong row rather than fail.
const picksValid = (question: AskQuestion, picks: readonly number[]): boolean => {
  const inRange = picks.every((idx) => Number.isInteger(idx) && idx >= 0 && idx < question.options.length);
  const ascending = picks.every((idx, i) => i === 0 || idx > (picks[i - 1] ?? -1));
  return inRange && ascending && (question.multiSelect || picks.length === 1);
};

// The review screen ("Ready to submit your answers?", with Submit preselected) appears for every
// shape EXCEPT a lone single-select question, which commits on the option's own Enter. All four
// shapes were measured; guessing here either leaves the dialog open or drops a stray Enter into
// the prompt once it has closed.
const needsReview = (questions: readonly AskQuestion[]): boolean => questions.length > 1 || questions.some((question) => question.multiSelect);

/**
 * The keystrokes that answer a live AskUserQuestion dialog. `picks[i]` holds the chosen option
 * indexes of `questions[i]` — exactly one for a single-select question, any ascending set for a
 * multi-select one. Null when the picks do not fit the questions, so a caller cannot half-drive
 * a dialog it has misread.
 */
export const keysForAnswers = (questions: readonly AskQuestion[], picks: readonly (readonly number[])[]): string[] | null => {
  if (questions.length === 0 || picks.length !== questions.length) return null;
  const paired = questions.map((question, i) => ({ question, picks: picks[i] ?? [] }));
  if (!paired.every(({ question, picks: chosen }) => picksValid(question, chosen))) return null;
  const keys = paired.flatMap(({ question, picks: chosen }) => keysForOne(question, chosen));
  return needsReview(questions) ? [...keys, KEY_ENTER] : keys;
};
