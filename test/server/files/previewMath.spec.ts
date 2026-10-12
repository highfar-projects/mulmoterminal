// @vitest-environment node
import { describe, it, expect } from "vitest";
import { Marked } from "marked";
import { formulaHtml, previewMath } from "../../../server/files/previewMath";

// #3017. Maths in the Files preview is typeset to SVG here, with the markdown plugin's own delimiter
// rules and without the TeX package that puts markup under the author's control.
const render = async (markdown: string): Promise<string> => {
  const math = await previewMath(markdown);
  const marked = new Marked();
  if (math) marked.use(math);
  return marked.parse(markdown);
};

describe("previewMath", () => {
  it("typesets inline and display maths to SVG, with a MathML copy beside each", async () => {
    const html = await render("Energy $E=mc^2$ here.\n\n$$\n\\int_0^1 x\\,dx\n$$\n");
    expect(html).toContain('<span class="math"><mjx-container');
    expect(html).toContain('<div class="math"><mjx-container');
    expect(html.match(/<svg/g)).toHaveLength(2);
    expect(html.match(/<mjx-assistive-mml/g)).toHaveLength(2);
    expect(html).not.toContain("$E=mc^2$");
  });

  it("loads nothing for a document with no $", async () => {
    expect(await previewMath("# plain\n\nno maths here")).toBeNull();
  });

  // The delimiter rules are the plugin's: a price is not maths, and a code span or fence is code.
  it("leaves prices, code spans and fences alone", async () => {
    const html = await render("It costs $5 and $10.\n\nRun `$x$` or:\n\n```\n$$y$$\n```\n");
    expect(html).not.toContain("<mjx-container");
    expect(html).toContain("$5 and $10");
    expect(html).toContain("<code>$x$</code>");
    expect(html).toContain("$$y$$");
  });

  // The `html` package is left out, so the commands that put author markup into the SVG do not exist:
  // no link, no class, no style comes through, whatever the TeX asks for.
  it.each([
    ["\\href", "$\\href{javascript:alert(1)}{x}$", /javascript:|<a\b/],
    ["\\style", "$\\style{position:fixed;inset:0}{x}$", /position:\s*fixed/],
    ["\\class", "$\\class{fixed inset-0}{x}$", /fixed inset-0/],
    ["\\cssId", "$\\cssId{evil}{x}$", /id="evil"/],
    // Neither `require` nor `autoload` is among the packages, so the left-out one cannot be loaded back.
    ["\\require{html}", "$\\require{html}\\href{javascript:alert(1)}{x}$", /javascript:|<a\b/],
  ])("does not let %s through", async (_command, markdown, forbidden) => {
    expect(await render(markdown)).not.toMatch(forbidden);
  });

  // The property the filter exists for (#3017, raised in review): whatever command an author uses and
  // whichever argument they put it in, their text never lands in an attribute. Leaving packages out
  // was not enough — `\mmlToken` is in `base` — so this throws the commands that write attributes at
  // the whole renderer, in both modes.
  const M = "evil;url(javascript:alert(1));position:fixed";
  const ATTACKS = [
    `\\href{${M}}{x}`,
    `\\style{${M}}{x}`,
    `\\class{${M}}{x}`,
    `\\cssId{${M}}{x}`,
    `\\require{html}\\href{${M}}{x}`,
    `\\bbox[${M}]{x}`,
    `\\color{${M}}{x}`,
    `\\textcolor{${M}}{x}`,
    `\\colorbox{${M}}{x}`,
    `\\fcolorbox{${M}}{${M}}{x}`,
    `\\enclose{${M}}[${M}]{x}`,
    `\\cancel[${M}]{x}`,
    `\\cancelto{${M}}{x}`,
    `\\mmlToken{mi}[mathcolor="${M}"]{x}`,
    `\\mmlToken{mi}[style="${M}"]{x}`,
    `\\mmlToken{mi}[mathbackground="${M}"]{x}`,
    `\\mmlToken{mi}[href="${M}"]{x}`,
    `\\mmlToken{mspace}[width="${M}"]{}`,
    `\\unicode[${M}]{x41}`,
    `\\texttip{x}{${M}}`,
    `\\mathtip{x}{${M}}`,
    `\\tag{${M}}x`,
    `\\label{${M}}x\\eqref{${M}}`,
    `\\verb|${M}|`,
    `\\text{${M}<script>alert(1)</script>}`,
    `\\operatorname{${M}}x`,
    `\\newcommand{\\z}{\\mmlToken{mi}[style="${M}"]{x}}\\z`,
    `\\begin{array}{${M}}x\\end{array}`,
    `\\cellcolor{${M}}x`,
    `\\fbox{${M}}`,
    `\\undefinedmacro{${M}}`,
  ];
  const attributeValues = (html: string): string[] => [...html.matchAll(/\s[\w:-]+="([^"]*)"/g)].map((m) => m[1]);
  it.each(
    ATTACKS.flatMap((tex) => [
      [tex, false],
      [tex, true],
    ]),
  )("keeps author text out of every attribute: %s (display %s)", async (tex, display) => {
    const html = await render(display ? `$$${tex}$$` : `$${tex}$`);
    expect(html).toContain("<mjx-container");
    attributeValues(html).forEach((value) => {
      // A bare word may stay (an unknown colour name is harmless); what makes it an attack may not.
      expect(value).not.toMatch(/javascript|url\(|position:\s*fixed/i);
    });
    expect(html).not.toMatch(/<script/i);
  });

  // The filter is a list of what is permitted, so it is pinned the other way too: ordinary formulas
  // keep their colours, their alignment and their glyphs.
  it("keeps what an ordinary formula needs", async () => {
    const html = await render("$\\color{red}{x}+\\frac{a}{b}$");
    expect(html).toContain('fill="red"');
    expect(html).toMatch(/style="vertical-align: -?[\d.]+ex;"/);
    expect(html).toMatch(/<path [^>]*d="M/);
  });

  // Round 2 of the review found the circle missing: the list had no `rx`. The shapes MathJax draws
  // for enclosures and frames, pinned through the whole renderer.
  it.each([
    ["\\enclose{circle}{z}", /<ellipse [^>]*rx="[\d.]+"/],
    ["\\enclose{roundedbox}{z}", /<rect [^>]*rx="[\d.]+"/],
    ["\\enclose{phasorangle}{z}", /<path style="stroke-width: 67;" d="M [\d.]+/],
    ["\\fcolorbox{red}{yellow}{z}", /fill="yellow"/],
  ])("keeps the geometry of %s", async (tex, shape) => {
    expect(await render(`$${tex}$`)).toMatch(shape);
  });

  it("renders TeX it cannot parse as an error inside the formula, not as a failed page", async () => {
    const html = await render("bad $\\frac{1}$ formula");
    expect(html).toContain("<mjx-container");
    expect(html).toContain("bad ");
  });

  it("falls back to the TeX as code when the typesetter itself throws", () => {
    const throwing = (): string => {
      throw new Error("boom");
    };
    expect(formulaHtml(throwing, "a<b", false, false)).toBe("<code>a&lt;b</code>");
  });
});
