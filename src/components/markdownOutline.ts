// The headings of a Markdown file, for the Files pane's outline (#2576). Pure: text in, headings out.
//
// It reads the headings the Preview will draw, in the same order, so a heading picked here can be
// found there by its position: ATX (`## Title`) and one-line setext (`Title` over `===` / `---`),
// never inside a code fence, and not in the YAML front matter the Preview drops (#2264).

export interface OutlineHeading {
  level: number;
  /** The heading as a reader sees it — inline markup (`**`, backticks, link targets) removed. */
  text: string;
  /** 1-based line in the source. */
  line: number;
}

const MAX_INDENT = 3;
const MAX_LEVEL = 6;
const MIN_FENCE = 3;

/** The line without up to three leading spaces, or null when it is indented further (a code block). */
function unindented(line: string): string | null {
  const spaces = line.length - line.trimStart().length;
  if (line.startsWith("\t") || spaces > MAX_INDENT) return null;
  return line.slice(spaces);
}

/** How many times `char` repeats at the start of `text`. */
function runOf(text: string, char: string): number {
  const other = [...text].findIndex((c) => c !== char);
  return other === -1 ? text.length : other;
}

/** The fence this line opens or closes (its run of backticks or tildes), or null. */
function fenceRun(line: string): string | null {
  const body = unindented(line);
  const char = body?.[0];
  if (!body || (char !== "`" && char !== "~")) return null;
  const length = runOf(body, char);
  return length >= MIN_FENCE ? char.repeat(length) : null;
}

/** An ATX heading's level and raw text, or null when the line is not one. */
function atxHeading(line: string): { level: number; raw: string } | null {
  const body = unindented(line);
  if (!body?.startsWith("#")) return null;
  const level = runOf(body, "#");
  const after = body.slice(level);
  if (level > MAX_LEVEL || (after !== "" && after[0] !== " " && after[0] !== "\t")) return null;
  return { level, raw: after };
}

/** A closing run of `#` after whitespace, removed — `## Title ##` reads `Title`. */
function withoutClosingHashes(text: string): string {
  const trimmed = text.trimEnd();
  const hashes = runOf([...trimmed].reverse().join(""), "#");
  const kept = trimmed.slice(0, trimmed.length - hashes);
  return hashes > 0 && (kept === "" || /\s$/.test(kept)) ? kept.trimEnd() : trimmed;
}

/** `[label](target)` as `label`: every `](…)` cut, then the brackets. */
function withoutLinkTargets(text: string): string {
  const open = text.indexOf("](");
  const close = open === -1 ? -1 : text.indexOf(")", open + 2);
  if (close === -1) return text.replaceAll("![", "").replaceAll("[", "").replaceAll("]", "");
  return withoutLinkTargets(text.slice(0, open) + text.slice(close + 1));
}

/** Inline markup a reader does not see: emphasis marks, code ticks, a link's target, a closing `#` run. */
export const plainHeadingText = (raw: string): string =>
  withoutLinkTargets(withoutClosingHashes(raw))
    .replace(/[*_`~]/g, "")
    .trim();

const LIST_MARKER = /^(?:[-*+]|\d+[.)])[ \t]/;

/** Whether `line` can be the text of a setext heading: a paragraph line, not a list item, a quote,
 *  a table row or another heading. */
function paragraphLine(line: string): boolean {
  const body = unindented(line);
  if (!body || body.trim() === "" || atxHeading(line) || fenceRun(line)) return false;
  return !">|".includes(body[0] ?? "") && !LIST_MARKER.test(body);
}

/** An underline of one repeated character (`=` or `-`), trailing spaces allowed. */
function underlineOf(line: string, char: string): boolean {
  const body = unindented(line)?.trimEnd();
  return !!body && runOf(body, char) === body.length;
}

function setextLevel(lines: string[], i: number): number | null {
  const text = lines[i] ?? "";
  const under = lines[i + 1] ?? "";
  // One-line paragraphs only: a longer one's heading spans lines the outline would have to join.
  if (!paragraphLine(text) || (i > 0 && (lines[i - 1] ?? "").trim() !== "")) return null;
  if (underlineOf(under, "=")) return 1;
  return underlineOf(under, "-") ? 2 : null;
}

/** Where the body starts: after a front matter block opened by `---` on the first line and closed
 *  by `---` or `...`; 0 when there is none, or when it is never closed (then it is not front matter). */
function bodyStart(lines: string[]): number {
  if (lines[0]?.trim() !== "---") return 0;
  const close = lines.findIndex((line, i) => i > 0 && (line.trim() === "---" || line.trim() === "..."));
  return close === -1 ? 0 : close + 1;
}

/** Whether `line` closes the fence `open`: the same character, at least as many, nothing after. */
const closesFence = (line: string, open: string): boolean => {
  const run = fenceRun(line);
  return run !== null && run[0] === open[0] && run.length >= open.length && line.trim() === run;
};

/** The heading on line `i`, and how many lines it takes, or null. */
function headingAt(lines: string[], i: number): { heading: OutlineHeading | null; span: number } | null {
  const line = lines[i] ?? "";
  const atx = atxHeading(line);
  const level = atx ? atx.level : setextLevel(lines, i);
  if (level === null) return null;
  const text = plainHeadingText(atx ? atx.raw : line);
  return { heading: text === "" ? null : { level, text, line: i + 1 }, span: atx ? 1 : 2 };
}

export function markdownOutline(source: string): OutlineHeading[] {
  const lines = source.split(/\r\n?|\n/);
  const headings: OutlineHeading[] = [];
  let fence: string | null = null;
  let i = bodyStart(lines);
  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (fence !== null) {
      if (closesFence(line, fence)) fence = null;
      i += 1;
      continue;
    }
    fence = fenceRun(line);
    const found = fence === null ? headingAt(lines, i) : null;
    if (found?.heading) headings.push(found.heading);
    i += found ? found.span : 1;
  }
  return headings;
}

/** The heading the reader is under: the last one at or above `topLine`, or null above the first or
 *  when there is no line to go by. */
export function currentHeadingIndex(headings: OutlineHeading[], topLine: number | null): number | null {
  if (topLine === null) return null;
  const at = headings.reduce((found, heading, index) => (heading.line <= topLine ? index : found), -1);
  return at === -1 ? null : at;
}
