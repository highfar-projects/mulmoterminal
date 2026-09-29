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
interface Grammar {
  parser: { parse: (code: string) => SyntaxTree };
}

/** A block past this is shown plain: the parse is linear, but a generated file pasted into a fence
 *  would hold up the whole document for colour nobody reads. */
export const MAX_HIGHLIGHT_CHARS = 200_000;

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

/** The block's inner HTML with a `tok-*` class on each token, or null to leave it to marked's
 *  own rendering: a language with no grammar here, or a block too large to be worth it. */
export function highlightedCode(code: string, lang: string | undefined): string | null {
  const grammar = GRAMMARS.get(fenceLanguage(lang));
  if (!grammar || code.length > MAX_HIGHLIGHT_CHARS) return null;
  const parts: string[] = [];
  highlightCode(
    code,
    grammar.parser.parse(code),
    classHighlighter,
    (text, classes) => parts.push(classes ? `<span class="${classes}">${escapeHtml(text)}</span>` : escapeHtml(text)),
    () => parts.push("\n"),
  );
  return parts.join("");
}

/** A whole `<pre>` block for a fence we can colour, else null. The class is the info string's first
 *  word, as marked writes it, so nothing that styled `language-*` before stops matching. */
export function highlightedFence(code: string, lang: string | undefined): string | null {
  const inner = highlightedCode(code, lang);
  if (inner === null) return null;
  const name = /^\S*/.exec(lang ?? "")?.[0] ?? "";
  return `<pre><code class="language-${escapeHtml(name)}">${inner}</code></pre>\n`;
}
