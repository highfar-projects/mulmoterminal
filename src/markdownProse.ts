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
 *  DOMPurify a Promise (which sanitizes to the string "[object Promise]"). */
export function renderMarkdownProse(markdown: string): string {
  const parsed = marked.parse(markdown, { async: false });
  return DOMPurify.sanitize(typeof parsed === "string" ? parsed : "");
}
