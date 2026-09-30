// The code blocks of a Markdown document, in the order the Preview draws them (#2615). The Preview
// numbers each block it draws (`data-code-block`) and a click hands the Files pane that number; the
// pane takes the block's text from the FILE by it. So what is shown and copied never comes out of
// the document, whose markup and styles a `.md` controls — only which block to show does.
//
// Pure: Markdown in, blocks out, from marked's own lexer — the one the server draws with.
import { Marked, type Token, type Tokens } from "marked";
import { splitFrontmatter } from "@mulmoclaude/markdown-utils/markdown/frontmatter";
import { isRecord } from "./isRecord.js";

export interface PreviewCodeBlock {
  /** The info string's first word, as the Preview names the block's language; "" for none. */
  lang: string;
  text: string;
}

export const isPreviewCodeBlock = (value: unknown): value is PreviewCodeBlock =>
  isRecord(value) && typeof value.lang === "string" && typeof value.text === "string";

/** The attribute the server puts on each block it draws, holding its number. */
export const CODE_BLOCK_ATTR = "data-code-block";

const isCodeToken = (token: Token): token is Tokens.Code => token.type === "code";
const isListToken = (token: Token): token is Tokens.List => token.type === "list";

/** The block tokens a token holds — a list's items, or a quote's or item's own tokens. A code block
 *  lives only at block level, so a table's inline cells need no walking. */
const childTokens = (token: Token): Token[] => {
  if (isListToken(token)) return token.items;
  return "tokens" in token && Array.isArray(token.tokens) ? token.tokens : [];
};

/** Depth-first, in document order — the order marked renders them in, so the n-th here is the n-th drawn. */
const codeTokens = (tokens: Token[]): Tokens.Code[] => tokens.flatMap((token) => (isCodeToken(token) ? [token] : codeTokens(childTokens(token))));

/** The first word of a fence's info string (`ts title="x"` → `ts`). */
export const infoWord = (lang: string | undefined): string => /^\S*/.exec((lang ?? "").trim())?.[0] ?? "";

// An indented block's text keeps the newline that ended it; the Preview draws none, so none is copied.
const withoutTrailingNewlines = (text: string): string => {
  const lines = text.split("\n");
  const lastWithText = lines.reduce((last, line, index) => (line === "" ? last : index), -1);
  return lines.slice(0, lastWithText + 1).join("\n");
};

export const previewCodeBlocks = (markdown: string): PreviewCodeBlock[] =>
  codeTokens(new Marked().lexer(splitFrontmatter(markdown).body)).map((token) => ({ lang: infoWord(token.lang), text: withoutTrailingNewlines(token.text) }));
