// marked's `code` renderer for the Markdown Preview (#2615): the coloured block where there is a
// grammar (#2579), marked's own otherwise, and either way numbered in drawing order — the number the
// Preview's copy button hands the Files pane, which takes the block's text from the file by it
// (common/previewCodeBlocks.ts counts the same blocks in the same order).
import { Renderer, type Tokens } from "marked";
import { CODE_BLOCK_ATTR } from "../../common/previewCodeBlocks.js";

type Colourer = (code: string, lang: string | undefined) => string | null;

/** One document's renderer: the count starts at 0 for each document. */
export function numberedCodeRenderer(colour: Colourer): (token: Tokens.Code) => string {
  const plain = new Renderer();
  let drawn = 0;
  return (token) => {
    const html = colour(token.text, token.lang) ?? plain.code(token);
    const numbered = html.replace(/^<pre\b/, `<pre ${CODE_BLOCK_ATTR}="${drawn}"`);
    drawn += 1;
    return numbered;
  };
}
