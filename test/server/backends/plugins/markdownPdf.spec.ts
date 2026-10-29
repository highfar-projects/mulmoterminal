// @vitest-environment node
import { describe, it, expect } from "vitest";
import ts from "typescript";
import { marked } from "marked";
import type { PDFOptions } from "puppeteer";
import {
  DIAGRAM_DRAW_TIMEOUT_MS,
  MARKDOWN_PDF_CSS,
  MERMAID_PDF_STYLE,
  drawDiagrams,
  drawDiagramsScript,
  markdownPdfDocument,
  printMarkdown,
  type PrintablePage,
} from "../../../../server/backends/plugins/markdown-pdf";
import { MERMAID_STYLE, drawDiagramsSource } from "../../../../server/files/previewMermaid";
import { installedMermaid, mermaidBundlePath } from "../../../../server/files/mermaidAssets";

// #3214. The Canvas draws a mermaid fence; the PDF printed it as a code block. The PDF now carries
// the Preview's placeholder and runs the Preview's drawing in the page before printing it.

const FLOW = "graph TD\n  A --> B";
const fenced = (lang: string, text: string): string => "```" + lang + "\n" + text + "\n```\n";

/** A small deterministic generator, so a failing case can be found again by its seed. */
const lcg = (seed: number): ((bound: number) => number) => {
  let state = seed;
  return (bound) => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state % bound;
  };
};

describe("markdownPdfDocument", () => {
  it("puts a mermaid fence's placeholder beside the block marked makes of it, and counts it", async () => {
    const doc = await markdownPdfDocument("# T\n\n" + fenced("mermaid", FLOW));
    expect(doc.diagrams).toBe(1);
    expect(doc.html).toContain('<pre class="mermaid" data-mermaid-pending="1">graph TD\n  A --&gt; B</pre>');
    expect(doc.html).toContain('<details class="mermaid-source" open>');
    expect(doc.html).toContain('<pre><code class="language-mermaid">graph TD\n  A --&gt; B\n</code></pre>');
  });

  it("styles the placeholder and the disclosure only in a document that has a diagram", async () => {
    const withOne = await markdownPdfDocument(fenced("mermaid", FLOW));
    const without = await markdownPdfDocument(fenced("js", "1"));
    expect(withOne.html).toContain(`<style>${MARKDOWN_PDF_CSS}${MERMAID_STYLE}${MERMAID_PDF_STYLE}</style>`);
    expect(without.html).toContain(`<style>${MARKDOWN_PDF_CSS}</style>`);
    expect(without.diagrams).toBe(0);
  });

  // The export used to be `marked.parse` and nothing else. A document with no mermaid fence must
  // still be exactly that, whatever else is in it — generated, since the risk of swapping the code
  // renderer is in what it changed unnoticed. The near misses (a capitalised word, a longer one)
  // are fences too, and the Preview draws neither.
  it("is marked's own HTML for a document without a mermaid fence", async () => {
    const pieces = [
      "# Heading\n\n",
      "a *b* `c` <d> & e\n\n",
      fenced("js", "const a = 1 < 2;"),
      fenced("", "plain"),
      fenced("Mermaid", "x"),
      fenced("mermaid-ish", "x"),
      fenced('ts title="x"', "let x: number;"),
      "- l1\n- l2\n\n",
      "| a | b |\n|---|---|\n| 1 | 2 |\n\n",
      "![i](p.png)\n\n",
      "    indented\n\n",
      "~~~js\n~~~\n",
    ];
    const rand = lcg(3214);
    const cases = Array.from({ length: 200 }, () => Array.from({ length: 1 + rand(4) }, () => pieces[rand(pieces.length)]).join(""));
    await Promise.all(
      cases.map(async (markdown) => {
        const doc = await markdownPdfDocument(markdown);
        expect(doc.diagrams).toBe(0);
        expect(doc.html).toContain(`<body>${await marked.parse(markdown)}</body>`);
      }),
    );
  });
});

describe("drawDiagramsScript", () => {
  it("is the Preview's drawing for mermaid's light theme, in a function so its awaits may run from evaluate", () => {
    expect(drawDiagramsScript()).toBe(`(async () => {\n${drawDiagramsSource("default")}\n})()`);
  });

  // A string here and a program in the browser: a syntax error would print every diagram as its block.
  it("parses as a script", () => {
    const result = ts.transpileModule(drawDiagramsScript(), {
      reportDiagnostics: true,
      fileName: "draw.js",
      compilerOptions: { allowJs: true, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    });
    expect(result.diagnostics ?? []).toEqual([]);
  });
});

interface Recorder {
  page: PrintablePage;
  calls: string[];
  scripts: string[];
  evaluated: string[];
  pdfOptions: PDFOptions[];
}

const recorder = (evaluate: () => Promise<unknown> = async () => undefined): Recorder => {
  const calls: string[] = [];
  const scripts: string[] = [];
  const evaluated: string[] = [];
  const pdfOptions: PDFOptions[] = [];
  const page: PrintablePage = {
    async setContent() {
      calls.push("setContent");
    },
    async addScriptTag({ path }) {
      calls.push("addScriptTag");
      scripts.push(path);
    },
    async evaluate(script) {
      calls.push("evaluate");
      evaluated.push(script);
      return evaluate();
    },
    async pdf(options) {
      calls.push("pdf");
      pdfOptions.push(options);
      return new Uint8Array([1]);
    },
  };
  return { page, calls, scripts, evaluated, pdfOptions };
};

const dist = installedMermaid();
const SHORT_WAIT_MS = 20;

describe("drawDiagrams", () => {
  it("puts the installed mermaid's single-file build into the page, then runs the drawing", async () => {
    const rec = recorder();
    expect(await drawDiagrams(rec.page, dist)).toBe(true);
    expect(rec.calls).toEqual(["addScriptTag", "evaluate"]);
    expect(rec.scripts).toEqual([mermaidBundlePath(dist)]);
    expect(rec.evaluated).toEqual([drawDiagramsScript()]);
  });

  it("stops waiting for a drawing that never settles, and says so", async () => {
    const rec = recorder(() => new Promise(() => {}));
    expect(await drawDiagrams(rec.page, dist, SHORT_WAIT_MS)).toBe(false);
  });

  it("waits a bounded time by default", () => {
    expect(DIAGRAM_DRAW_TIMEOUT_MS).toBeGreaterThan(0);
  });
});

describe("printMarkdown", () => {
  it("lays the document out, draws, and prints at the asked size", async () => {
    const rec = recorder();
    await printMarkdown(rec.page, { markdown: fenced("mermaid", FLOW), format: "A4" });
    expect(rec.calls).toEqual(["setContent", "addScriptTag", "evaluate", "pdf"]);
    expect(rec.pdfOptions[0]).toMatchObject({ format: "A4", printBackground: true, margin: { top: "16mm", bottom: "16mm", left: "16mm", right: "16mm" } });
  });

  it("prints a document without a diagram without putting mermaid into it, on Letter when no size is asked", async () => {
    const rec = recorder();
    await printMarkdown(rec.page, { markdown: fenced("js", "1") });
    expect(rec.calls).toEqual(["setContent", "pdf"]);
    expect(rec.pdfOptions[0]?.format).toBe("Letter");
  });
});
