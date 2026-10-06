// Making a markdown or html file self-contained before it leaves for the phone (#2911).
//
// The phone cannot reach this machine, so an image a document names by relative path would be a
// broken box there. Those images are embedded as `data:` URLs up to a byte budget, and the ones that
// do not fit are counted rather than silently lost. An html file is then wrapped in a CSP that
// allows NO network fetch and no remote image: everything it shows is already inside it, so a page
// written by an agent has no channel to send the document anywhere.
import { SANDBOXED_VIEW_CDN_ALLOWLIST } from "@mulmoclaude/core/remote-view";

import type { MobileFileKind } from "../../../common/mobileFiles.js";

// `![alt](…)` captures what is between the parens; `markdownImageSrc` takes the src out of it, so the
// pattern stays a plain run of negated classes. `<img … src="…">` captures the src directly.
const MARKDOWN_IMAGE_RE = /!\[[^\]\n]*\]\(([^)\n]*)\)/g;
const HTML_IMAGE_RE = /<img\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']/gi;
const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;

/** A `src` that names a file next to the document, rather than a URL, an anchor or a root path. */
export function isRelativeImageRef(src: string): boolean {
  return src !== "" && !SCHEME_RE.test(src) && !src.startsWith("/") && !src.startsWith("#");
}

/** The src in a markdown image's parens: `<a b.png> "title"` -> `a b.png`, `a.png "title"` -> `a.png`. */
export function markdownImageSrc(inner: string): string {
  const trimmed = inner.trim();
  if (trimmed.startsWith("<")) {
    const close = trimmed.indexOf(">");
    return close < 0 ? "" : trimmed.slice(1, close);
  }
  return trimmed.split(/\s/)[0] ?? "";
}

/** Every relative image a document refers to, each once, in order of first appearance. */
export function relativeImageRefs(text: string, kind: "markdown" | "html"): string[] {
  const markdownRefs = kind === "markdown" ? [...text.matchAll(MARKDOWN_IMAGE_RE)].map((match) => markdownImageSrc(match[1] ?? "")) : [];
  const htmlRefs = [...text.matchAll(HTML_IMAGE_RE)].flatMap((match) => match[1] ?? []);
  return [...new Set([...markdownRefs, ...htmlRefs].filter(isRelativeImageRef))];
}

/** Loads one image the document named, or null when it may not or cannot be embedded. */
export type ImageLoader = (src: string) => Promise<{ dataUrl: string } | null>;

/** The document with as many relative images embedded as `budgetBytes` allows, and how many were not. */
export async function inlineRelativeImages(
  text: string,
  kind: "markdown" | "html",
  loadImage: ImageLoader,
  budgetBytes: number,
): Promise<{ text: string; omittedImages: number }> {
  const refs = relativeImageRefs(text, kind);
  const embedded = new Map<string, string>();
  let remaining = budgetBytes;
  for (const ref of refs) {
    const loaded = await loadImage(ref);
    if (!loaded || loaded.dataUrl.length > remaining) continue;
    remaining -= loaded.dataUrl.length;
    embedded.set(ref, loaded.dataUrl);
  }
  const swap = (marker: RegExp, srcOf: (captured: string) => string) => (whole: string, captured: string) => {
    const src = srcOf(captured);
    const dataUrl = embedded.get(src);
    if (dataUrl === undefined) return whole;
    // Replace the src itself, not an alt text or title that happens to spell the same thing.
    const at = whole.indexOf(src, Math.max(0, whole.search(marker)));
    return at < 0 ? whole : whole.slice(0, at) + dataUrl + whole.slice(at + src.length);
  };
  const markdownDone = kind === "markdown" ? text.replace(MARKDOWN_IMAGE_RE, swap(/\]\(/, markdownImageSrc)) : text;
  const replaced = markdownDone.replace(
    HTML_IMAGE_RE,
    swap(/\bsrc\s*=/i, (captured) => captured),
  );
  return { text: replaced, omittedImages: refs.length - embedded.size };
}

/** The CSP an html file is shown under on the phone. Stricter than a remote view's: no `https:`
 *  image or media source, because this document's images are already embedded. */
export function buildMobileHtmlCsp(cdns: readonly string[] = SANDBOXED_VIEW_CDN_ALLOWLIST): string {
  const cdnList = cdns.join(" ");
  return [
    "default-src 'none'",
    `script-src 'unsafe-inline' ${cdnList}`,
    `style-src 'unsafe-inline' ${cdnList}`,
    `font-src ${cdnList}`,
    "img-src data: blob:",
    "media-src data: blob:",
    "connect-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
  ].join("; ");
}

/** The html with its CSP as the very first thing in the document. Not spliced in after `<head>`:
 *  a `<head>` inside a comment that comes first would take the meta with it and leave the page
 *  unprotected. Leading, the parser opens the head itself and the document's own doctype and head
 *  tags merge into it. */
export function wrapMobileHtml(html: string): string {
  return `<!DOCTYPE html><meta http-equiv="Content-Security-Policy" content="${buildMobileHtmlCsp()}">${html}`;
}

/** The text as it should travel: images embedded, and html wrapped. */
export async function prepareDocument(
  text: string,
  kind: Extract<MobileFileKind, "markdown" | "html">,
  loadImage: ImageLoader,
  imageBudgetBytes: number,
): Promise<{ text: string; omittedImages: number }> {
  const inlined = await inlineRelativeImages(text, kind, loadImage, imageBudgetBytes);
  return kind === "html" ? { text: wrapMobileHtml(inlined.text), omittedImages: inlined.omittedImages } : inlined;
}
