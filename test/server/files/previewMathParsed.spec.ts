// @vitest-environment node
import { describe, it, expect } from "vitest";
import { Marked } from "marked";
import { parseFragment } from "parse5";
import { previewMath } from "../../../server/files/previewMath";

// #3017, round 3 of the review. A string check on the output is not the boundary: the browser's HTML
// parser is. So the typeset maths is parsed here with parse5 — the HTML standard's tree construction,
// foreign content (SVG, MathML) included — and what the parser BUILT is checked: the elements and
// their attributes, for author text that became markup.
const render = async (markdown: string): Promise<string> => {
  const math = await previewMath(markdown);
  const marked = new Marked();
  if (math) marked.use(math);
  return marked.parse(markdown);
};
const WRAPPERS = new Set(["p", "span", "div", "code"]);
const MATH = new Set(
  "mjx-container mjx-assistive-mml svg g path rect line ellipse polygon text math mrow mi mo mn ms mtext mspace mstyle merror mpadded mphantom menclose mfrac msqrt mroot msub msup msubsup munder mover munderover mmultiscripts mprescripts none mtable mtr mlabeledtr mtd maligngroup malignmark mfenced".split(
    " ",
  ),
);
const M = 'x"><svg onload=alert(1)><img src=x onerror=alert(2)><script>alert(3)</script>';
const ATTACKS = [
  `\\mmlToken{mi}[data-variant="${M}"]{x}`,
  `\\mmlToken{mi}[mathvariant="${M}"]{x}`,
  `\\mmlToken{mi}[${M}]{x}`,
  `\\mmlToken{mtext}{${M}}`,
  `\\text{${M}}`,
  `\\verb|${M}|`,
  `\\operatorname{${M}}x`,
  `\\label{${M}}x\\label{${M}}y`,
  `\\undefinedmacro{${M}}`,
  `\\begin{array}{${M}}x\\end{array}`,
  `\\color{${M}}{x}`,
  `\\unicode[${M}]{x41}`,
  `\\tag{${M}}x`,
  `\\frac{${M}}`,
];

interface ParsedNode {
  nodeName: string;
  attrs?: { name: string; value: string }[];
  childNodes?: ParsedNode[];
}
const isParsedNode = (value: unknown): value is ParsedNode => typeof value === "object" && value !== null && "nodeName" in value;
const elementsOf = (node: ParsedNode): ParsedNode[] => {
  const children = (node.childNodes ?? []).filter(isParsedNode);
  return children.flatMap((child) => (child.attrs ? [child, ...elementsOf(child)] : elementsOf(child)));
};

describe("typeset maths as the preview document's parser builds it", () => {
  it.each(
    ATTACKS.flatMap((tex) => [
      [tex, false],
      [tex, true],
    ]),
  )("builds no element or handler from author text: %s (display %s)", async (tex, display) => {
    const fragment: unknown = parseFragment(await render(display ? `$$${tex}$$` : `$${tex}$`));
    if (!isParsedNode(fragment)) throw new Error("parse5 returned no fragment");
    elementsOf(fragment).forEach((element) => {
      const name = element.nodeName;
      expect(WRAPPERS.has(name) || MATH.has(name), `<${name}>`).toBe(true);
      (element.attrs ?? []).forEach((attribute) => {
        expect(attribute.name.startsWith("on"), `${name} ${attribute.name}`).toBe(false);
        expect(attribute.value).not.toMatch(/javascript|url\(/i);
      });
    });
  });
});
