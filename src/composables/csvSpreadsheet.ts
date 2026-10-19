// A CSV or TSV file as the arguments `presentSpreadsheet` takes: one sheet, the file's rows as
// they are, numbers as numbers. Pure, so what the Files pane makes of a file is testable without
// a browser or a server.
import type { SpreadsheetArgs, SpreadsheetCell } from "@gui-chat-plugin/spreadsheet/core";
import { delimiterForExtension, parseDelimited } from "../../common/delimited";

/** The most rows a file may have and still open as a spreadsheet. Past it the agent aggregates
 *  the file instead (the data-analysis skill's own threshold), and a sheet that size is slow. */
export const MAX_SPREADSHEET_ROWS = 5000;

const SHEET_NAME = "Data";

// A plain decimal, as a person or an export writes it: `12`, `-3.5`, `.5`, `1e3`. Anything else —
// `1,200`, `5%`, `007`, `+1`, a date — stays text, so the copy holds what the file holds.
const NUMBER_CHARACTERS = /^[-+.\deE]+$/;
const LEADING_ZERO = /^-?0\d/;
const isPlainNumber = (text: string): boolean =>
  NUMBER_CHARACTERS.test(text) && !text.startsWith("+") && !LEADING_ZERO.test(text) && Number.isFinite(Number(text));

export type CsvSpreadsheet = { kind: "sheet"; args: SpreadsheetArgs; rows: number } | { kind: "empty" } | { kind: "too-large"; rows: number };

/** One field as a cell. Text starting with `=` would be read as a formula, so it keeps a leading
 *  `'` — the mark a spreadsheet uses for "this is text" — rather than running as one. */
export function cellFromField(field: string): SpreadsheetCell {
  const trimmed = field.trim();
  if (isPlainNumber(trimmed)) return { v: Number(trimmed) };
  return { v: field.startsWith("=") ? `'${field}` : field };
}

/** The spreadsheet for `text`, the contents of a file named `fileName`. */
export function csvSpreadsheet(text: string, fileName: string): CsvSpreadsheet {
  const extension = fileName.slice(fileName.lastIndexOf("."));
  const rows = parseDelimited(text, delimiterForExtension(extension));
  if (rows.length === 0) return { kind: "empty" };
  if (rows.length > MAX_SPREADSHEET_ROWS) return { kind: "too-large", rows: rows.length };
  const data = rows.map((row) => row.map(cellFromField));
  return { kind: "sheet", args: { title: fileName, sheets: [{ name: SHEET_NAME, data }] }, rows: rows.length };
}
