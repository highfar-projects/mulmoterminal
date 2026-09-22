// A captured screen, row by row, with each row's DIM run kept beside its plain text.
//
// Dim is the one attribute that has to survive capture. Claude Code offers a follow-up
// prompt as dim ghost text in its input box — accepted with Tab at the keyboard:
//
//   ESC[39m❯ ESC[2mmilestones に目標を書くESC[0m
//
// Stripped of colour that is indistinguishable from a line the user typed, and the two
// need opposite handling on the phone: the ghost text can be sent as it stands, while
// typed text is already in the box and sending it again would double it.

export interface ScreenRow {
  text: string;
  // The dim-attributed part of the row, "" when it has none.
  dim: string;
  // True when the row's content runs flush to the pane's right edge — the width comparison
  // is done at parse time, once, because that is the only place the pane's column count is
  // in scope. Used to tell a hard wrap (a token with no space of its own, like a URL, split
  // for want of room) apart from an ordinary word-wrap when a suggestion is rejoined below:
  // a word-wrap stops short of the edge because a whole word did not fit, a hard wrap runs
  // out of room mid-token and has nothing short of the edge to show for it.
  full: boolean;
}

const ESC = "\u001b";
const BEL = "\u0007";

// tmux's `capture-pane -e` re-emits two kinds of escape, both verified against a live
// pane: SGR (the attributes) and OSC 8 hyperlinks. Neither belongs in the text. The
// trailing alternative catches any other two-byte escape rather than printing it:
//
//   ESC ] <text> (BEL | ESC \)  |  ESC [ <params> <letter>  |  ESC <byte>
//
// Composed from the control bytes rather than written as one literal: a regex literal
// carrying them is exactly what the control-character lint rules exist to stop.
const ESCAPE_SPLIT = new RegExp(`(${ESC}\\][^${BEL}${ESC}]*(?:${BEL}|${ESC}\\\\)?|${ESC}\\[[\\d;:]*[a-zA-Z]|${ESC}[@-_])`, "u");
const SGR = new RegExp(`^${ESC}\\[([\\d;:]*)m$`, "u");

// Walk SGR parameters left to right. 38/48/58 introduce an extended colour whose own
// arguments must be skipped — otherwise the trailing 2 of "38;5;2" (green) reads as the
// dim attribute and swallows the rest of the line.
const dimAfter = (dim: boolean, params: readonly string[]): boolean => {
  const [code, ...rest] = params;
  if (code === undefined) return dim;
  if (code === "38" || code === "48" || code === "58") return dimAfter(dim, rest.slice(rest[0] === "5" ? 2 : 4));
  if (code === "2") return dimAfter(true, rest);
  if (code === "" || code === "0" || code === "22") return dimAfter(false, rest);
  return dimAfter(dim, rest);
};

const dimAfterEscape = (sequence: string, dim: boolean): boolean => {
  const sgr = SGR.exec(sequence);
  return sgr === null ? dim : dimAfter(dim, (sgr[1] ?? "").split(";"));
};

interface RowScan {
  text: string;
  dim: string;
  on: boolean;
}

// Splitting on a capturing escape pattern yields text and escapes alternately, so the
// odd positions are the sequences and the even ones the printable runs between them.
const foldPart = (scan: RowScan, part: string, index: number): RowScan => {
  if (index % 2 === 1) return { ...scan, on: dimAfterEscape(part, scan.on) };
  return { ...scan, text: scan.text + part, dim: scan.on ? scan.dim + part : scan.dim };
};

// `capture-pane` drops the blanks that pad a row WITHOUT `-e` and keeps them WITH it,
// so they are dropped here — the phone is shown the plain screen. Only the ASCII space
// is padding: Claude Code draws its empty input box as "❯" + U+00A0, which tmux keeps
// and a plain trimEnd would eat.
// Scanned rather than matched with " +$", which backtracks quadratically on a row that
// is mostly blanks — and a screen row is as wide as the terminal.
const withoutTrailingPad = (text: string): string => text.slice(0, text.split("").findLastIndex((char) => char !== " ") + 1);

// `cols` is undefined for a session captured through tmux alone, with no live PTY to ask —
// `full` then defaults to false on every row, which is the join's old, always-guess
// behaviour (see joinWrapped): safer than mis-detecting a hard wrap against a width that
// was never actually known.
const parseRow = (line: string, cols: number | undefined): ScreenRow => {
  const { text, dim } = line.split(ESCAPE_SPLIT).reduce(foldPart, { text: "", dim: "", on: false });
  const trimmedText = withoutTrailingPad(text);
  return { text: trimmedText, dim: withoutTrailingPad(dim), full: cols !== undefined && trimmedText.length === cols };
};

export const parseStyledRows = (styled: string, cols?: number): ScreenRow[] => styled.split("\n").map((line) => parseRow(line, cols));

export const rowsToScreen = (rows: readonly ScreenRow[]): string => rows.map((row) => row.text).join("\n");

// The caret an agent draws in front of its input box. Deliberately NOT the ASCII ">":
// agent output is full of quoted lines and diffs, and one of those rendered dim would
// read as a suggestion the user never saw.
const CARET = /^\s*[❯›]\s/u;

const afterCaret = (text: string): string | undefined => {
  const caret = CARET.exec(text);
  return caret === null ? undefined : text.slice(caret[0].length);
};

// The row that OFFERS a suggestion: everything past the caret is dim. Text the user
// typed is not dim, which is what keeps a real draft out of this.
const offersSuggestion = (row: ScreenRow): boolean => {
  const rest = afterCaret(row.text)?.trim();
  return rest !== undefined && rest !== "" && rest === row.dim.trim();
};

// A wrapped continuation of the row above: no caret of its own, all of it dim.
const continuesSuggestion = (row: ScreenRow): boolean => {
  const text = row.text.trim();
  return text !== "" && text === row.dim.trim() && !CARET.test(row.text);
};

const ASCII_TAIL = /[!-~]$/u;
const ASCII_HEAD = /^[!-~]/u;

// The box wraps the ghost text itself, so the break usually carries no character: an
// English line break ate the space between two words, a Japanese one had none to eat.
// The exception is a token with no spaces of its own — a URL, a long path — that fills a
// row on its own and is split for want of room: `before` isn't short of the edge because a
// whole word didn't fit, it ran out of room mid-token, so there was never a space there to
// restore. `before.full` is how the two are told apart (see the field's own comment).
const joinWrapped = (head: string, before: ScreenRow, tail: string): string => {
  if (!before.full && ASCII_TAIL.test(head) && ASCII_HEAD.test(tail)) return `${head} ${tail}`;
  return `${head}${tail}`;
};

const wrappedRows = (rows: readonly ScreenRow[]): readonly ScreenRow[] => {
  const broken = rows.findIndex((row) => !continuesSuggestion(row));
  return broken === -1 ? rows : rows.slice(0, broken);
};

// The suggestion the screen is currently offering, or "" when it is offering none.
// Scans for the LAST caret row: scrollback can hold an old prompt above the live one.
export const suggestionFromRows = (rows: readonly ScreenRow[]): string => {
  const start = rows.findLastIndex(offersSuggestion);
  if (start === -1) return "";
  const head = rows[start];
  if (head === undefined) return ""; // unreachable: findLastIndex answered a real index
  // Folded rather than indexed: `before` is the row the wrap actually came from, carried
  // along as its own accumulator field rather than re-fetched by position.
  return wrappedRows(rows.slice(start + 1)).reduce(({ before, text }, row) => ({ before: row, text: joinWrapped(text, before, row.dim.trim()) }), {
    before: head,
    text: head.dim.trim(),
  }).text;
};
