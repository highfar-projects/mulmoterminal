// Maths in the Files preview (#3017): `$…$` and `$$…$$` typeset to SVG here, on the server, so the
// preview document stays the script-free page it is. The delimiter rules are the markdown plugin's own
// (`mathExtension`), so a formula is found where the Canvas finds it; only the renderer differs.
//
// The plugin sanitises its SVG with DOMPurify, which needs a DOM the server does not have. The input
// side is narrowed instead: the TeX `html` package is the one that puts markup under the author's
// control (`\href`, `\class`, `\style`, `\cssId`), so it is left out. The preview's CSP (no
// `javascript:`, nonce'd scripts only) still stands behind that.
import type { MarkedExtension, TokenizerExtension, Tokens } from "marked";
import { mathExtension } from "@mulmoclaude/markdown-utils/markdown/mathExtension";

const AUTHOR_MARKUP_PACKAGE = "html";

export type Typeset = (tex: string, display: boolean) => string;

// Loaded on the first document that may hold maths, not at boot: most previews have none. And built
// once per process, because `RegisterHTMLHandler` mutates a MathJax-global list.
let typesetter: Promise<Typeset> | null = null;

async function buildTypesetter(): Promise<Typeset> {
  const [{ mathjax }, { TeX }, { SVG }, { liteAdaptor }, { RegisterHTMLHandler }, { AllPackages }, { AssistiveMmlHandler }, { LiteElement }] =
    await Promise.all([
      import("mathjax-full/js/mathjax.js"),
      import("mathjax-full/js/input/tex.js"),
      import("mathjax-full/js/output/svg.js"),
      import("mathjax-full/js/adaptors/liteAdaptor.js"),
      import("mathjax-full/js/handlers/html.js"),
      import("mathjax-full/js/input/tex/AllPackages.js"),
      import("mathjax-full/js/a11y/assistive-mml.js"),
      import("mathjax-full/js/adaptors/lite/Element.js"),
    ]);
  const adaptor = liteAdaptor();
  AssistiveMmlHandler(RegisterHTMLHandler(adaptor));
  const doc = mathjax.document("", {
    InputJax: new TeX({ packages: AllPackages.filter((name) => name !== AUTHOR_MARKUP_PACKAGE) }),
    // Each glyph inlined as its own path: no `<defs>`/`<use>` to depend on.
    OutputJax: new SVG({ fontCache: "none" }),
  });
  // `convert` is declared `any`; the lite adaptor's own element class is what it really returns.
  return (tex, display) => {
    const node: unknown = doc.convert(tex, { display });
    if (!(node instanceof LiteElement)) throw new Error("MathJax returned an unexpected node");
    return adaptor.outerHTML(node);
  };
}

/** The typesetter, built on first use; a failed build is dropped so the next document can try again. */
function loadTypesetter(): Promise<Typeset> {
  if (typesetter) return typesetter;
  const attempt = buildTypesetter();
  attempt.catch(() => {
    if (typesetter === attempt) typesetter = null;
  });
  typesetter = attempt;
  return attempt;
}

const escapeHtml = (text: string): string => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

interface MathToken extends Tokens.Generic {
  text: string;
  display: boolean;
}
const isMathToken = (token: Tokens.Generic): token is MathToken => typeof token.text === "string" && typeof token.display === "boolean";

/** One formula as markup; the TeX as code when MathJax itself throws, so the page still renders. */
export function formulaHtml(typeset: Typeset, tex: string, display: boolean, block: boolean): string {
  const tag = block ? "div" : "span";
  try {
    return `<${tag} class="math">${typeset(tex, display)}</${tag}>${block ? "\n" : ""}`;
  } catch {
    return `<code>${escapeHtml(tex)}</code>`;
  }
}

const isTokenizerExtension = (extension: unknown): extension is TokenizerExtension =>
  typeof extension === "object" && extension !== null && "tokenizer" in extension && "level" in extension;

/** The plugin's tokenizers, with `typeset` in place of its placeholder renderer. */
export const mathRendering = (typeset: Typeset): MarkedExtension => ({
  extensions: (mathExtension.extensions ?? []).filter(isTokenizerExtension).map((extension) => ({
    ...extension,
    renderer: (token: Tokens.Generic) => (isMathToken(token) ? formulaHtml(typeset, token.text, token.display, extension.level === "block") : false),
  })),
});

/** The extension for `text`, or null for a document with no `$` at all — no MathJax for that one. A
 *  MathJax that will not load leaves the formulas as the text they were, rather than failing the page. */
export async function previewMath(text: string): Promise<MarkedExtension | null> {
  if (!text.includes("$")) return null;
  try {
    return mathRendering(await loadTypesetter());
  } catch (error) {
    console.error("[files] maths renderer did not load", error);
    return null;
  }
}

// The MathML copy MathJax puts beside each SVG is for screen readers: hidden from sight, kept in the
// accessibility tree (the clip idiom, not `display:none`). Display maths gets its own line.
export const MATH_STYLE =
  "mjx-assistive-mml{position:absolute!important;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap}" +
  "div.math{margin:1em 0;text-align:center;overflow-x:auto}";
