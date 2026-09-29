// The place a compiler, a linter or an agent names after a path: `src/a.ts:42`, `src/a.ts:42:7`
// (gcc, eslint, grep -n, most agents) or `src/a.ts(12,5)` (tsc, MSBuild). Pure, so the shapes a
// terminal prints can be listed in a spec rather than found by clicking.

/** A 1-based line, and a 1-based column when one was given — as the tools print them. */
export interface FileLocation {
  line: number;
  col: number | null;
}

// Bounded so a run of digits that is not a line number (a port, a timestamp) is not read as one.
const MAX_DIGITS = 7;
const COLON_FORM = new RegExp(`^:(\\d{1,${MAX_DIGITS}})(?::(\\d{1,${MAX_DIGITS}}))?(?!\\d)`);
const PAREN_FORM = new RegExp(`^\\((\\d{1,${MAX_DIGITS}})(?:,\\s?(\\d{1,${MAX_DIGITS}}))?\\)`);
const QUERY_NUMBER = new RegExp(`^\\d{1,${MAX_DIGITS}}$`);

const positive = (digits: string | undefined): number | null => {
  const value = digits === undefined ? NaN : Number(digits);
  return Number.isInteger(value) && value >= 1 ? value : null;
};

/** The location `rest` opens with — the text right after a path — and how many characters it
 *  takes, or null when it names none. Line 0 is not a line; a column of 0 is dropped. */
export function locationAfterPath(rest: string): { location: FileLocation; length: number } | null {
  const match = COLON_FORM.exec(rest) ?? PAREN_FORM.exec(rest);
  const line = positive(match?.[1]);
  if (!match || line === null) return null;
  return { location: { line, col: positive(match[2]) }, length: match[0].length };
}

/** A location read back from the Files view's `?line=&col=`, or null when the line is not one.
 *  The query is a string anyone can type, so it is held to the same rule as a printed one. */
export function locationFromQuery(line: string | null, col: string | null): FileLocation | null {
  const lineNumber = line !== null && QUERY_NUMBER.test(line) ? positive(line) : null;
  if (lineNumber === null) return null;
  return { line: lineNumber, col: col !== null && QUERY_NUMBER.test(col) ? positive(col) : null };
}

/** The `?line=&col=` a location travels to the Files view as. */
export function locationQuery(location: FileLocation | undefined): Record<string, string> {
  if (!location) return {};
  return location.col === null ? { line: String(location.line) } : { line: String(location.line), col: String(location.col) };
}
