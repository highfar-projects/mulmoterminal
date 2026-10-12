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
