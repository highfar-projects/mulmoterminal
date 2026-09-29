// A fenced code block in the Markdown Preview, coloured on the server (#2579). The Preview document
// may run one script only (mdPreviewEmbed.ts), and the plain one in a new tab none at all, so the
// colour has to be in the HTML already. The grammars are the editor's own (@codemirror/lang-*), so
// a file and a fence of the same language read the same.
//
// Pure: code and a fence's language in, HTML out.
import { classHighlighter, highlightCode } from "@lezer/highlight";
import { javascriptLanguage, jsxLanguage, tsxLanguage, typescriptLanguage } from "@codemirror/lang-javascript";
import { jsonLanguage } from "@codemirror/lang-json";
import { pythonLanguage } from "@codemirror/lang-python";
import { cssLanguage } from "@codemirror/lang-css";
import { htmlLanguage } from "@codemirror/lang-html";
import { yamlLanguage } from "@codemirror/lang-yaml";
import { xmlLanguage } from "@codemirror/lang-xml";
import { rustLanguage } from "@codemirror/lang-rust";
import { goLanguage } from "@codemirror/lang-go";
import { javaLanguage } from "@codemirror/lang-java";
import { cppLanguage } from "@codemirror/lang-cpp";
import { phpLanguage } from "@codemirror/lang-php";
import { StandardSQL } from "@codemirror/lang-sql";
import { markdownLanguage } from "@codemirror/lang-markdown";
import { escapeHtml } from "./renderedDoc.js";

type SyntaxTree = Parameters<typeof highlightCode>[1];
interface PartialParse {
  advance: () => SyntaxTree | null;
}
interface Grammar {
  parser: { startParse: (code: string) => PartialParse };
}

/** A block past this is shown plain without trying: colour nobody reads, for a generated file. */
export const MAX_HIGHLIGHT_CHARS = 200_000;

/** How long one block may take to parse, and one document in all. Ordinary code is far inside
 *  both; a block built to be pathological for its grammar is not — it can take minutes and
 *  gigabytes, on the thread every terminal shares — so a parse is advanced in steps and given up
 *  when the time is spent, and the block is shown plain. */
export const BLOCK_BUDGET_MS = 100;
export const DOCUMENT_BUDGET_MS = 400;

/** Markdown's cap, far below the others: its grammar parses a paragraph's inline markup in ONE step,
 *  and that step is quadratic, so the budget cannot stop it — the size has to. At this size the
 *  worst inputs measured stay within the block budget. */
export const MAX_MARKDOWN_HIGHLIGHT_CHARS = 10_000;
const MARKDOWN_NAMES = new Set(["md", "markdown"]);

/** The names a fence is written with, lowercased, to the grammar that reads them. A Map, so a fence
 *  labelled `constructor` or `__proto__` finds nothing rather than something off `Object.prototype`. */
const GRAMMARS = new Map<string, Grammar>(
  Object.entries({
    js: javascriptLanguage,
    javascript: javascriptLanguage,
    mjs: javascriptLanguage,
    cjs: javascriptLanguage,
    jsx: jsxLanguage,
    ts: typescriptLanguage,
    typescript: typescriptLanguage,
    mts: typescriptLanguage,
    cts: typescriptLanguage,
    tsx: tsxLanguage,
    json: jsonLanguage,
    jsonc: jsonLanguage,
    py: pythonLanguage,
    python: pythonLanguage,
    css: cssLanguage,
    html: htmlLanguage,
    vue: htmlLanguage,
    yaml: yamlLanguage,
    yml: yamlLanguage,
    xml: xmlLanguage,
    svg: xmlLanguage,
    rust: rustLanguage,
    rs: rustLanguage,
    go: goLanguage,
    java: javaLanguage,
    c: cppLanguage,
    h: cppLanguage,
    cpp: cppLanguage,
    "c++": cppLanguage,
    cc: cppLanguage,
    hpp: cppLanguage,
    // A fence of PHP rarely opens with `<?php`, so it is read as code rather than as a template.
    php: phpLanguage.configure({ top: "Program" }),
    sql: StandardSQL.language,
    md: markdownLanguage,
    markdown: markdownLanguage,
  }),
);

/** The first word of a fence's info string, as marked hands it over (`ts title="x"` → `ts`). */
export const fenceLanguage = (lang: string | undefined): string => (lang ?? "").trim().split(/\s/)[0]?.toLowerCase() ?? "";

/** The tree for `code`, or null when the parse has not finished by `deadline`. */
function parseBy(grammar: Grammar, code: string, deadline: number, now: () => number): SyntaxTree | null {
  const parse = grammar.parser.startParse(code);
  let tree = parse.advance();
  while (tree === null && now() < deadline) tree = parse.advance();
  return tree;
}

/** The block's inner HTML with a `tok-*` class on each token, or null to leave it to marked's
 *  own rendering: a language with no grammar here, a block too large to be worth it, one that
 *  did not parse by `deadline`, or one the grammar or the highlighter threw on (a deep enough
 *  nesting overflows the stack). */
export function highlightedCode(
  code: string,
  lang: string | undefined,
  deadline = Infinity,
  now: () => number = performance.now.bind(performance),
): string | null {
  const name = fenceLanguage(lang);
  const grammar = GRAMMARS.get(name);
  const cap = MARKDOWN_NAMES.has(name) ? MAX_MARKDOWN_HIGHLIGHT_CHARS : MAX_HIGHLIGHT_CHARS;
  if (!grammar || code.length > cap) return null;
  try {
    const tree = parseBy(grammar, code, deadline, now);
    if (!tree) return null;
    const parts: string[] = [];
    highlightCode(
      code,
      tree,
      classHighlighter,
      (text, classes) => parts.push(classes ? `<span class="${classes}">${escapeHtml(text)}</span>` : escapeHtml(text)),
      () => parts.push("\n"),
    );
    return parts.join("");
  } catch {
    return null;
  }
}

/** One document's fences, sharing its time: each block gets `BLOCK_BUDGET_MS` at most, and none
 *  once the document's `DOCUMENT_BUDGET_MS` is spent. */
export function fenceColourer(now: () => number = performance.now.bind(performance)): (code: string, lang: string | undefined) => string | null {
  const documentDeadline = now() + DOCUMENT_BUDGET_MS;
  return (code, lang) => {
    const start = now();
    if (start >= documentDeadline) return null;
    return highlightedFence(code, lang, Math.min(start + BLOCK_BUDGET_MS, documentDeadline), now);
  };
}

/** A whole `<pre>` block for a fence we can colour, else null. The class is the info string's first
 *  word, as marked writes it, so nothing that styled `language-*` before stops matching. */
export function highlightedFence(code: string, lang: string | undefined, deadline = Infinity, now?: () => number): string | null {
  const inner = highlightedCode(code, lang, deadline, now);
  if (inner === null) return null;
  const name = /^\S*/.exec(lang ?? "")?.[0] ?? "";
  return `<pre><code class="language-${escapeHtml(name)}">${inner}</code></pre>\n`;
}
