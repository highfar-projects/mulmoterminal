// The one script the embeddable Markdown preview runs (#2157) — see mdPreviewEmbed.ts for the policy
// that lets it run and nothing else. Its own module because it is pure text-building with no Node
// dependency, unlike the nonce beside it there.
import { EXTERNAL_HREF, isPreviewToken, MD_PREVIEW_FROM_FRAME, MD_PREVIEW_FROM_HOST, OTHER_SCHEME_HREF } from "../../common/mdPreviewMessage.js";

/** How long the document sits on a burst of scrolling before reporting where it ended up.
 *  `setTimeout` rather than `requestAnimationFrame` deliberately: the pane hides this iframe with
 *  `display:none` when the reader switches back to the editor, which stops animation frames — the
 *  last scroll before that switch is exactly the position worth keeping. */
const SCROLL_REPORT_MS = 120;

/** How long after putting the reader back the document stays quiet about where it is.
 *
 *  Restoring scrolls, and scrolling reports — so without this the document answers its own
 *  restore. That is not merely redundant: a place past the end of a document that has not
 *  finished growing is CLAMPED by `scrollTo`, so the echo would tell the host a smaller number
 *  than it just sent, and the place would be lost by being restored. */
const RESTORE_SETTLE_MS = 250;

/** The reporter itself, as it is written into the document.
 *
 *  It reports where the reader is and puts them back where the host says, and it holds no state
 *  the host does not send: a document that has just loaded knows nothing, so it announces itself
 *  and the HOST answers with the place. That inversion is what makes a re-render (the file
 *  changed on disk, so the iframe reloaded) land where the reader was rather than at the top.
 *
 *  `event.source !== parent` is the only check it can make: its own origin is opaque, so the host
 *  it posts to cannot be named by origin either — hence the `"*"` target, carrying a scroll
 *  offset and nothing else.
 *
 *  The subtleties are one thing: a `scrollTo` into a page with no room for it yet is CLAMPED, so
 *  the place is lost by being applied. The quiet window covers the consequence — a clamped
 *  position must never be reported back as the reader's, or the restore overwrites what it was
 *  restoring — and the ResizeObserver covers the cause, by applying the place again whenever the
 *  page grows under it.
 *
 *  It has to be the page's own HEIGHT that is watched, and it has to be the DOCUMENT watching.
 *  Two things make a place arrive too early, and neither is visible from outside: images here are
 *  sized from the viewport and declare no dimensions, so the page grows as they load; and the pane
 *  hides this frame with `display:none` when the reader switches to the editor, which leaves the
 *  document with no layout at all — every `scrollTo` clamps to the top, so a place that arrives
 *  then (the pane coming back in the editor, the file changing on disk behind it) is taken and
 *  lost. Measured rather than reasoned: `resize` does NOT fire on the way back, because the
 *  frame's `innerHeight` never changed — only `scrollHeight` did, from one viewport to the whole
 *  document. A host-side re-send when the preview is shown does not work either: `display` going
 *  back is not layout having happened, and it passed one run in three.
 *
 *  The re-apply stops once the reader has scrolled for themselves, because from then on the
 *  remembered place is no longer where they are — and it stops on their scroll EVENT rather than
 *  on the report of it, which is throttled. The gap between the two is a window in which the next
 *  image to land would pull them back to a place they had already left. */
// A heading the host's outline picked (#2576): by position, checked against its text. It becomes the
// anchor the place follows, and the host hears where that is.
const HEADING_LOOKUP = [
  "const headingFor = (index, text) => {",
  "  const norm = (value) => String(value).replace(/\\s+/g, ' ').trim();",
  "  const all = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'));",
  "  const at = all[index];",
  "  return at && norm(at.textContent) === norm(text) ? at : all.find((h) => norm(h.textContent) === norm(text)) || at;",
  "};",
];

const reporterSource = (token: string | null): string =>
  [
    "(() => {",
    // Every message carries the token this document was served with (#2515): the host takes only
    // messages with the token of the document it asked for, which a page this frame was navigated to
    // never had. `token` has passed isPreviewToken, and JSON.stringify quotes it either way.
    `const post = (message) => { parent.postMessage({ ...message, token: ${JSON.stringify(token)}, source: ${JSON.stringify(MD_PREVIEW_FROM_FRAME)} }, "*"); };`,
    "let place = null;",
    "let quietUntil = 0;",
    "let readerMoved = false;",
    "let pending = 0;",
    // The heading a pick went to, while the reader has not scrolled since: the place follows IT, so
    // an image that loads above it and pushes it down does not leave the pick on a stale pixel.
    "let anchor = null;",
    "const applyPlace = () => {",
    "  if (anchor) place = Math.max(0, Math.round(anchor.getBoundingClientRect().top + scrollY));",
    "  if (place === null) return;",
    `  quietUntil = Date.now() + ${RESTORE_SETTLE_MS};`,
    "  scrollTo(0, place);",
    "};",
    "addEventListener('scroll', () => {",
    "  if (Date.now() < quietUntil) return;",
    "  readerMoved = true;",
    "  anchor = null;",
    "  if (pending) return;",
    "  pending = setTimeout(() => {",
    "    pending = 0;",
    '    post({ kind: "scroll", scrollY: Math.round(scrollY) });',
    `  }, ${SCROLL_REPORT_MS});`,
    "}, { passive: true });",
    ...HEADING_LOOKUP,
    "addEventListener('message', (event) => {",
    "  if (event.source !== parent) return;",
    "  const data = event.data;",
    `  if (!data || data.source !== ${JSON.stringify(MD_PREVIEW_FROM_HOST)}) return;`,
    "  if (typeof data.heading === 'number' && typeof data.headingText === 'string') {",
    "    const target = headingFor(data.heading, data.headingText);",
    "    if (!target) return;",
    "    anchor = target;",
    "    readerMoved = false;",
    "    applyPlace();",
    '    post({ kind: "scroll", scrollY: place });',
    "    return;",
    "  }",
    "  if (typeof data.scrollY !== 'number') return;",
    "  anchor = null;",
    "  place = data.scrollY;",
    "  applyPlace();",
    "});",
    "new ResizeObserver(() => { if (!readerMoved) applyPlace(); }).observe(document.documentElement);",
    // A link is handed to the host rather than followed, decided on the attribute as written. An
    // external one because the frame has no `allow-popups` and most sites refuse to be framed
    // (#2259); one to another file because the frame's URL is this server's route, so following it
    // is a 404 — the host opens it in a tab (#2268). An anchor, and a `mailto:` or other scheme,
    // keep their default.
    "addEventListener('click', (event) => {",
    "  const link = event.target instanceof Element ? event.target.closest('a[href]') : null;",
    "  const href = link ? link.getAttribute('href') : null;",
    "  if (!href || href.startsWith('#')) return;",
    `  const external = ${EXTERNAL_HREF}.test(href);`,
    `  if (!external && ${OTHER_SCHEME_HREF}.test(href)) return;`,
    "  event.preventDefault();",
    '  post(external ? { kind: "navigate", href } : { kind: "open", href });',
    "});",
    'post({ kind: "ready" });',
    "})();",
  ].join("\n");

/** The reporter as a `<script>` element carrying the nonce that lets it run.
 *
 *  Appended to the rendered body rather than placed in the head: the document it measures has to
 *  exist before `scrollTo` means anything, and this way the embeddable document differs from the
 *  plain one by exactly one trailing element. */
export const mdPreviewReporterTag = (nonce: string, token: string | null = null): string =>
  `<script nonce="${nonce}">${reporterSource(isPreviewToken(token) ? token : null)}</script>`;
