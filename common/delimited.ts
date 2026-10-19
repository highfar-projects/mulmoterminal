// Separated-values text (CSV, TSV) as rows. Shared because the server renders it as a table for
// the Files preview and the browser turns the same file into a spreadsheet; one parser means the
// two never disagree about where a field ends.

const BYTE_ORDER_MARK = "\uFEFF";

/** The delimiter a separated-values file uses, from its extension. */
export const delimiterForExtension = (ext: string): string => (ext.toLowerCase() === ".tsv" ? "\t" : ",");

/**
 * Rows of a delimited file, by RFC 4180: a field may be quoted, a quoted field may contain
 * the delimiter, a newline, or a doubled `""` standing for one quote.
 *
 * Hand-written rather than pulled in: the rule is small enough to state exactly, and the
 * failure mode of a loose one is a table that silently splits a field in half — which is
 * worse than not rendering at all, and invisible without the cases below.
 */
export function parseDelimited(source: string, delimiter: string): string[][] {
  // A byte-order mark is how many exporters (Excel's "CSV UTF-8" among them) begin the file; it is
  // not part of the first field.
  const text = source.startsWith(BYTE_ORDER_MARK) ? source.slice(BYTE_ORDER_MARK.length) : source;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let i = 0;
  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };
  while (i < text.length) {
    const ch = text[i];
    // Only at the START of a field — `5" pipe` is text, not an opening quote.
    if (ch === '"' && field === "") {
      const quoted = readQuotedField(text, i + 1);
      field = quoted.value;
      i = quoted.next;
      continue;
    }
    if (ch === delimiter) {
      endField();
      i++;
      continue;
    }
    const rowBreak = rowBreakLength(text, i);
    if (rowBreak > 0) {
      endRow();
      i += rowBreak;
      continue;
    }
    field += ch;
    i++;
  }
  // A trailing newline ends the last row rather than starting an empty one.
  if (field !== "" || row.length > 0) endRow();
  return rows;
}

// How many characters the row break at `i` occupies: CRLF is one break, not two.
const rowBreakLength = (text: string, i: number): number => {
  if (text[i] === "\r") return text[i + 1] === "\n" ? 2 : 1;
  return text[i] === "\n" ? 1 : 0;
};

// A quoted field, scanned from just after its opening quote. `""` is one literal quote; an
// unterminated quote takes the rest of the file rather than dropping it.
function readQuotedField(text: string, start: number): { value: string; next: number } {
  let value = "";
  let i = start;
  while (i < text.length) {
    if (text[i] === '"') {
      if (text[i + 1] !== '"') return { value, next: i + 1 };
      value += '"';
      i += 2;
      continue;
    }
    value += text[i];
    i++;
  }
  return { value, next: i };
}
