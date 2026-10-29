// The printable form of a Canvas document, for the markdown plugin's PDF export. The Canvas draws a
// `mermaid` fence through the plugin's renderer and the Markdown Preview through its own module
// script; the PDF is a third page, built here, and it had neither — a fence went to paper as the
// code block marked makes of it. It gets the Preview's placeholder and the Preview's drawing, run
// inside the page puppeteer is about to print. That page is `about:blank`, with no origin to import
// mermaid's entry from, so mermaid's single-file build is put into it from the installed package and
// the drawing finds it as a global. MulmoClaude's PDF route prints the plain block; the two hosts
// part here on purpose, because what the Canvas shows is what the PDF is asked for.
import { Marked, Renderer } from "marked";
import type { PDFOptions } from "puppeteer";
import type { ExportPdfOptions } from "@mulmoclaude/markdown-plugin";
import { diagramFenceRenderer, drawDiagramsSource, MERMAID_STYLE } from "../../files/previewMermaid.js";
import { installedMermaid, mermaidBundlePath, type MermaidDist } from "../../files/mermaidAssets.js";

export const MARKDOWN_PDF_CSS = `
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; font-size: 13px; line-height: 1.6; color: #1f2937; max-width: 800px; margin: 0 auto; padding: 32px 48px; }
  h1 { font-size: 1.75rem; } h2 { font-size: 1.25rem; border-bottom: 1px solid #e5e7eb; padding-bottom: .25rem; } h3 { font-size: 1rem; }
  pre { background: #f3f4f6; padding: .75rem; border-radius: .375rem; overflow-x: auto; } code { background: #f3f4f6; padding: .1rem .3rem; border-radius: .25rem; }
  table { border-collapse: collapse; width: 100%; } th, td { border: 1px solid #e5e7eb; padding: .5rem .75rem; } a { color: #2563eb; } img { max-width: 100%; height: auto; }
`;

/** On paper the folded disclosure is a control nobody can open: a drawn diagram stands alone, and
 *  only a failed fence keeps its block — without the summary line, which is a control too. A diagram
 *  is not split across pages. */
export const MERMAID_PDF_STYLE = [
  "details.mermaid-source:not([open]){display:none}",
  "details.mermaid-source>summary{display:none}",
  ".mermaid-diagram{break-inside:avoid}",
].join("");

/** How long the page may draw before it is printed as it stands. A placeholder still pending is
 *  hidden and its block is open, which is the PDF this export always printed — a diagram that never
 *  settles must not hold the request and the browser with it. */
export const DIAGRAM_DRAW_TIMEOUT_MS = 20_000;

/** The PDF is white, whatever the reader's scheme. */
const PDF_DIAGRAM_THEME = "default";

const PAGE_MARGIN = { top: "16mm", bottom: "16mm", left: "16mm", right: "16mm" };

const BLANK_PAGE = "about:blank";

/** What printing needs of puppeteer's page, so a spec can hand in a recorder. */
export interface PrintablePage {
  setContent(html: string, options: { waitUntil: "load" }): Promise<void>;
  goto(url: string): Promise<unknown>;
  addScriptTag(options: { path: string }): Promise<unknown>;
  evaluate(script: string): Promise<unknown>;
  pdf(options: PDFOptions): Promise<Uint8Array>;
}

export interface MarkdownPdfDocument {
  html: string;
  /** How many mermaid fences the document holds: none, and nothing is put into the page. */
  diagrams: number;
}

/** The document to print: marked's own HTML, with each mermaid fence as the Preview's placeholder
 *  beside the block marked makes of it. Every other fence is marked's alone, so a document without
 *  one is what `marked.parse` returns. */
export async function markdownPdfDocument(markdown: string): Promise<MarkdownPdfDocument> {
  const plain = new Renderer();
  const fences = diagramFenceRenderer((token) => plain.code(token));
  const body = await new Marked({ renderer: { code: fences.code } }).parse(markdown);
  const diagrams = fences.drawn();
  const style = MARKDOWN_PDF_CSS + (diagrams ? MERMAID_STYLE + MERMAID_PDF_STYLE : "");
  return { html: `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${style}</style></head><body>${body}</body></html>`, diagrams };
}

/** The drawing as one expression for `page.evaluate`: the Preview's text awaits at its top level, as
 *  a module may, so here it runs inside a function that may. */
export const drawDiagramsScript = (): string => `(async () => {\n${drawDiagramsSource(PDF_DIAGRAM_THEME)}\n})()`;

const EXPIRED = Symbol("expired");

/** `work`'s value, or `EXPIRED` when it has not settled within `ms`. `work` itself goes on. */
const settledWithin = async (work: Promise<unknown>, ms: number): Promise<unknown> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expiry = new Promise<typeof EXPIRED>((resolve) => {
    timer = setTimeout(() => resolve(EXPIRED), ms);
  });
  try {
    return await Promise.race([work, expiry]);
  } finally {
    clearTimeout(timer);
  }
};

/** Draw the placeholders in `page`, as the Preview draws its own. Says whether the drawing finished;
 *  a drawing that could not run says why in the log, and one that ran out of time may still be
 *  running in the page when this returns. */
export async function drawDiagrams(page: PrintablePage, dist: MermaidDist = installedMermaid(), timeoutMs = DIAGRAM_DRAW_TIMEOUT_MS): Promise<boolean> {
  try {
    await page.addScriptTag({ path: mermaidBundlePath(dist) });
    const settled = await settledWithin(page.evaluate(drawDiagramsScript()), timeoutMs);
    if (settled === EXPIRED) console.warn(`[markdown-pdf] the diagrams did not settle within ${timeoutMs}ms; printed as their blocks`);
    return settled !== EXPIRED;
  } catch (err) {
    console.warn(`[markdown-pdf] the diagrams could not be drawn, printed as their blocks: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

/** Print `markdown` as the Canvas showed it, the diagrams drawn before the page goes to paper. A
 *  drawing that did not finish is discarded with the window it runs in: the document is laid out
 *  again, untouched, so what is printed is the blocks the export always printed and not whatever
 *  a still-running drawing manages to replace while the page is being read. */
export async function printMarkdown(
  page: PrintablePage,
  options: Pick<ExportPdfOptions, "markdown" | "format">,
  timeoutMs = DIAGRAM_DRAW_TIMEOUT_MS,
): Promise<Uint8Array> {
  const { html, diagrams } = await markdownPdfDocument(options.markdown);
  await page.setContent(html, { waitUntil: "load" });
  if (diagrams && !(await drawDiagrams(page, installedMermaid(), timeoutMs))) {
    // `setContent` rewrites the document inside the same window, where the drawing's pending
    // promises still run and would still land; only a navigation discards that window with them.
    await page.goto(BLANK_PAGE);
    await page.setContent(html, { waitUntil: "load" });
  }
  return page.pdf({ format: options.format === "A4" ? "A4" : "Letter", margin: PAGE_MARGIN, printBackground: true });
}
