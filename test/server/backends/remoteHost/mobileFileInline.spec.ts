// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  buildMobileHtmlCsp,
  inlineRelativeImages,
  isRelativeImageRef,
  markdownImageSrc,
  prepareDocument,
  relativeImageRefs,
  wrapMobileHtml,
} from "../../../../server/backends/remoteHost/mobileFileInline";

const dataUrlFor = (src: string) => `data:image/png;base64,${Buffer.from(src).toString("base64")}`;
const loadAll = async (src: string) => ({ dataUrl: dataUrlFor(src) });

describe("isRelativeImageRef", () => {
  it.each(["a.png", "img/a.png", "../a.png"])("accepts %s", (src) => expect(isRelativeImageRef(src)).toBe(true));
  it.each(["https://x/a.png", "data:image/png;base64,AA", "/abs.png", "#frag", "", "//cdn/a.png", "javascript:x"])("refuses %j", (src) =>
    expect(isRelativeImageRef(src)).toBe(false),
  );
});

describe("markdownImageSrc", () => {
  it.each([
    ["a.png", "a.png"],
    [' a.png "title" ', "a.png"],
    ['<a b.png> "t"', "a b.png"],
    ["<unclosed", ""],
    ["", ""],
  ])("%j -> %j", (inner, expected) => expect(markdownImageSrc(inner)).toBe(expected));
});

describe("relativeImageRefs", () => {
  it("finds markdown and inline-html images in markdown, each once", () => {
    const text = '![a](img/a.png) ![b](<img/b.png> "t") <img alt="c" src="img/c.png"> ![a again](img/a.png) ![remote](https://x/y.png)';
    expect(relativeImageRefs(text, "markdown")).toEqual(["img/a.png", "img/b.png", "img/c.png"]);
  });

  it("reads only <img> in html", () => {
    expect(relativeImageRefs('![md](a.png) <IMG SRC="b.png">', "html")).toEqual(["b.png"]);
  });
});

describe("inlineRelativeImages", () => {
  it("embeds the src, never an alt text spelling the same thing", async () => {
    const result = await inlineRelativeImages("![a.png](a.png)", "markdown", loadAll, 10_000);
    expect(result.text).toBe(`![a.png](${dataUrlFor("a.png")})`);
    expect(result.omittedImages).toBe(0);
  });

  it("counts what does not fit the budget, and leaves it as it was", async () => {
    const budget = dataUrlFor("a.png").length;
    const result = await inlineRelativeImages("![](a.png) ![](b.png)", "markdown", loadAll, budget);
    expect(result.text).toBe(`![](${dataUrlFor("a.png")}) ![](b.png)`);
    expect(result.omittedImages).toBe(1);
  });

  it("counts an image the loader refuses", async () => {
    const result = await inlineRelativeImages('<img src="x.png">', "html", async () => null, 10_000);
    expect(result).toEqual({ text: '<img src="x.png">', omittedImages: 1 });
  });

  it("leaves a document without images untouched", async () => {
    expect(await inlineRelativeImages("# hi", "markdown", loadAll, 0)).toEqual({ text: "# hi", omittedImages: 0 });
  });
});

describe("the html wrapper", () => {
  it("forbids every network fetch and remote image", () => {
    const csp = buildMobileHtmlCsp([]);
    expect(csp).toContain("connect-src 'none'");
    expect(csp).toContain("img-src data: blob:");
    expect(csp).not.toMatch(/img-src[^;]*https:/);
    expect(csp).toContain("default-src 'none'");
  });

  it("puts the CSP before anything the document wrote, even a commented-out <head>", () => {
    const hostile = "<!-- <head> --><html><head><script>fetch('https://x')</script></head></html>";
    const wrapped = wrapMobileHtml(hostile);
    expect(wrapped.startsWith('<!DOCTYPE html><meta http-equiv="Content-Security-Policy"')).toBe(true);
    expect(wrapped.endsWith(hostile)).toBe(true);
  });

  it("prepares markdown without wrapping and html with it", async () => {
    expect((await prepareDocument("# t", "markdown", loadAll, 0)).text).toBe("# t");
    expect((await prepareDocument("<p>t</p>", "html", loadAll, 0)).text).toContain("Content-Security-Policy");
  });
});
