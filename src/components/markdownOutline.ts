// The headings of a Markdown file, for the Files pane's outline (#2576). Pure: text in, headings out.
//
// It reads the headings the Preview will draw, in the same order, so a heading picked here can be
// found there by its position: ATX (`## Title`) and one-line setext (`Title` over `===` / `---`),
// never inside a code fence or an HTML comment, and not in the YAML front matter the Preview drops
// (#2264) — decided by the same `splitFrontmatter` the server renders with, so the two agree.
import { splitFrontmatter } from "@mulmoclaude/markdown-utils/markdown/frontmatter";

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

/** The line without up to three leading spaces, or null when it is indented further or by a tab (a
 *  code block). Only ASCII spaces count, as in the Preview: an ideographic space is text. */
function unindented(line: string): string | null {
  const spaces = runOf(line, " ");
  if (spaces > MAX_INDENT || line[spaces] === "\t") return null;
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
  // A backtick fence's info string may not hold a backtick: "```x``` is inline" is a code span.
  if (char === "`" && body.slice(length).includes("`")) return null;
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

/** `[label](target)` and `![alt](src)` as their text; a bracket that is not a link stays (`[WIP]`). */
function withoutLinkTargets(text: string): string {
  const middle = text.indexOf("](");
  const open = middle === -1 ? -1 : text.lastIndexOf("[", middle);
  const close = open === -1 ? -1 : text.indexOf(")", middle + 2);
  if (close === -1) return text;
  const start = open > 0 && text[open - 1] === "!" ? open - 1 : open;
  return text.slice(0, start) + text.slice(open + 1, middle) + withoutLinkTargets(text.slice(close + 1));
}

/** A word's emphasis underscores, gone from its edges only — `_new_` reads `new`, `my_var` stays. */
function trimUnderscores(word: string): string {
  const start = runOf(word, "_");
  const end = runOf([...word].reverse().join(""), "_");
  return start >= word.length ? word : word.slice(start, word.length - end);
}

const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'" };

/** Outside code: emphasis marks (an underscore only at a word's edge, so `snake_case` stays),
 *  strikethrough `~~`, a backslash escape and the common entities — what the Preview does not draw. */
const plainProse = (text: string): string =>
  text
    .split(/\\(?=[!-/:-@[-`{-~])/)
    .map((part, i) => (i === 0 ? plainUnescaped(part) : part[0] + plainUnescaped(part.slice(1))))
    .join("");

/** `plainProse` for text holding no backslash escape: an escaped character is kept by the caller. */
const plainUnescaped = (text: string): string =>
  text
    .replace(/&(?:amp|lt|gt|quot|#39);/g, (entity) => ENTITIES[entity] ?? entity)
    .replaceAll("~~", "")
    .replaceAll("*", "")
    .split(" ")
    .map(trimUnderscores)
    .join(" ");

/** Inline markup a reader does not see — emphasis, code ticks, a link's target, a closing `#` run —
 *  leaving what is inside a code span exactly as written. */
export const plainHeadingText = (raw: string): string =>
  withoutLinkTargets(withoutClosingHashes(raw))
    .split("`")
    .map((part, i) => (i % 2 === 1 ? part : plainProse(part)))
    .join("")
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

/** A thematic break: three or more of one of `-`, `*`, `_`, spaces allowed between. */
function thematicBreak(line: string): boolean {
  const body = unindented(line)?.replaceAll(" ", "") ?? "";
  const char = body[0];
  return body.length >= MIN_FENCE && (char === "-" || char === "*" || char === "_") && runOf(body, char) === body.length;
}

/** `continuing` says the line before was paragraph text (a list item's and a quote's included, which
 *  run on lazily), so this line joins it rather than starting one — and only a paragraph of ONE line
 *  is read as a setext heading: a longer one spans lines the outline would have to join. */
function setextLevel(lines: string[], i: number, continuing: boolean): number | null {
  const text = lines[i] ?? "";
  const under = lines[i + 1] ?? "";
  if (continuing || !paragraphLine(text) || thematicBreak(text)) return null;
  if (underlineOf(under, "=")) return 1;
  return underlineOf(under, "-") ? 2 : null;
}

/** The line the body starts on: past the front matter the Preview drops, which is only a block that
 *  parses as YAML — a document opening with a `---` rule keeps it (the same call the server makes). */
const bodyStart = (source: string): number => splitFrontmatter(source).prefix.split("\n").length - 1;

/** Whether `line` opens an HTML comment block, and whether a line closes one. */
const opensComment = (line: string): boolean => unindented(line)?.startsWith("<!--") ?? false;
const commentEnds = (line: string): boolean => line.includes("-->");

/** Whether `line` closes the fence `open`: the same character, at least as many, nothing after. */
const closesFence = (line: string, open: string): boolean => {
  const run = fenceRun(line);
  return run !== null && run[0] === open[0] && run.length >= open.length && line.trim() === run;
};

/** The heading on line `i`, and how many lines it takes, or null. */
function headingAt(lines: string[], i: number, continuing: boolean): { heading: OutlineHeading | null; span: number } | null {
  const line = lines[i] ?? "";
  const atx = atxHeading(line);
  const level = atx ? atx.level : setextLevel(lines, i, continuing);
  if (level === null) return null;
  const text = plainHeadingText(atx ? atx.raw : line);
  return { heading: text === "" ? null : { level, text, line: i + 1 }, span: atx ? 1 : 2 };
}

/** How many lines from `i` a block that hides headings takes (a fence or an HTML comment), or 0. */
function hiddenSpan(lines: string[], i: number): number {
  const line = lines[i] ?? "";
  const fence = fenceRun(line);
  const comment = !fence && opensComment(line);
  if (!fence && !comment) return 0;
  if (comment && commentEnds(line)) return 1; // a one-line comment
  const ends = (l: string): boolean => (fence ? closesFence(l, fence) : commentEnds(l));
  const close = lines.findIndex((l, j) => j > i && ends(l));
  return close === -1 ? lines.length - i : close - i + 1;
}

export function markdownOutline(source: string): OutlineHeading[] {
  const lines = source.split(/\r\n?|\n/);
  const headings: OutlineHeading[] = [];
  let i = bodyStart(source);
  // Whether the line before was paragraph text, so this one would continue it (see setextLevel).
  let continuing = false;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    const hidden = hiddenSpan(lines, i);
    const found: ReturnType<typeof headingAt> = hidden === 0 ? headingAt(lines, i, continuing) : null;
    if (found?.heading) headings.push(found.heading);
    continuing = hidden === 0 && !found && line.trim() !== "" && !thematicBreak(line);
    i += hidden || (found ? found.span : 1);
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

/** Which of the headings with this one's text it is (0-based): the Preview's fallback when its own
 *  count of headings disagrees with the source's. */
export const headingOccurrence = (headings: OutlineHeading[], index: number): number =>
  headings.slice(0, index).filter((heading) => heading.text === headings[index]?.text).length;
