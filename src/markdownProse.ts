// Markdown to sanitized HTML, for prose an AGENT wrote (#2112).
//
// Separate from wikiMarkdown.ts rather than shared with it, and the split is the point: that one
// renders a WIKI PAGE — it strips frontmatter, turns `[[links]]` into clickable spans before marked
// sees them, and rewrites image sources onto MulmoTerminal's raw-file route. None of that belongs to
// a conversation, and a `[[…]]` in a reply would become a link to a page that does not exist.
//
// What they DO share is the pipeline and the reason for it: marked, then DOMPurify, because the
// input is LLM-authored and reaches the DOM through `v-html`. Same sanitizer, same defaults, so a
// hardening applied to one is not silently missing from the other — the one thing worth keeping
// identical between them.
import { marked } from "marked";
import DOMPurify from "dompurify";

/** Render `markdown` to HTML that is safe to hand to `v-html`.
 *
 *  `{ async: false }` makes marked return synchronously, but its declared return type is still
 *  `string | Promise<string>` — checked rather than asserted, so a future default flip cannot hand
 *  DOMPurify a Promise (which sanitizes to the string "[object Promise]").
 *
 *  EVERY LINK IS SENT TO A NEW TAB, and that is not decoration: MulmoTerminal is a single page
 *  holding live terminals, open panes and unsaved editor buffers, so an ordinary in-page navigation
 *  out of an agent's reply takes all of it with it and offers no way back. Agent replies are full of
 *  URLs. `rel` goes with `target` for the usual reason — an opened page must not reach `window.opener`
 *  — and it is set AFTER sanitizing so DOMPurify cannot be asked to allow an attribute we then have
 *  to trust it stripped correctly (Claude review, round 1). */
export function renderMarkdownProse(markdown: string): string {
  const parsed = marked.parse(markdown, { async: false });
  const clean = DOMPurify.sanitize(typeof parsed === "string" ? parsed : "");
  const doc = new DOMParser().parseFromString(clean, "text/html");
  doc.querySelectorAll("img[src]").forEach(unfetchedIfRemote);
  doc.querySelectorAll("a[href]").forEach((link) => {
    link.setAttribute("target", "_blank");
    link.setAttribute("rel", "noopener noreferrer");
  });
  return doc.body.innerHTML;
}

/** A REMOTE image becomes a link instead of an image (#2115).
 *
 *  An `<img>` fetches the moment it is in the document, so a reply carrying
 *  `![](https://somewhere/pixel.png)` tells that host the reader's address and the moment they
 *  opened the pane — and the reply is written by an agent that reads the web and other people's
 *  repositories, so its author need not be anyone here. Nothing is hidden: the URL becomes a link,
 *  which fetches when a reader decides to open it and not before. (The wiki does not have this
 *  shape — `renderWikiHtml` rewrites image sources onto MulmoTerminal's own raw-file route.)
 *
 *  `data:` and a relative path stay as images: neither leaves this origin. A `src` that will not
 *  parse is treated as remote, because the safe reading of "I cannot tell what this is" is not to
 *  fetch it. */
function unfetchedIfRemote(image: Element): void {
  const src = image.getAttribute("src") ?? "";
  if (!isRemoteUrl(src)) return;
  const link = image.ownerDocument.createElement("a");
  link.setAttribute("href", src);
  link.textContent = image.getAttribute("alt")?.trim() || src;
  image.replaceWith(link);
}

const isRemoteUrl = (src: string): boolean => {
  if (src.startsWith("data:")) return false;
  try {
    // Relative sources resolve onto this origin and stay here; anything that resolves elsewhere is
    // a request to somebody else.
    return new URL(src, window.location.href).origin !== window.location.origin;
  } catch {
    return true;
  }
};
