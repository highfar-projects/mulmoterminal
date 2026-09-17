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
  doc.querySelectorAll("a[href]").forEach((link) => {
    link.setAttribute("target", "_blank");
    link.setAttribute("rel", "noopener noreferrer");
  });
  return doc.body.innerHTML;
}
