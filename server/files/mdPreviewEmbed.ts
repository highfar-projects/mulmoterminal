// The EMBEDDABLE Markdown preview: the same rendering the new-tab view gets, plus the one script
// that can answer "where is the reader in this document" (#2157).
//
// The document has always been served under `Content-Security-Policy: sandbox` — no origin, no
// scripts — and that is what contains a `.md` this server never sanitised. Reading a scroll
// offset out of it needs SOMETHING to run inside, and the cheap way to get that is
// `allow-same-origin`, which puts unsanitised markdown on the app's own origin for good. This
// module takes the other road: the document stays opaque forever, and `script-src` with a
// per-response nonce lets exactly one script run — the one written here.
//
// So the file's own `<script>` and `onerror=` stay dead, because they carry no nonce and
// `'unsafe-inline'` is absent. Two things must hold for that to remain true, and both are pinned
// by this module's spec: the nonce is unguessable and fresh per response, and nothing derived
// from the file is ever interpolated into the script.
//
// Pure except for `newPreviewNonce`, which is the one value that must not be predictable.
import { randomBytes } from "node:crypto";
import { MD_PREVIEW_EMBED_ON, MD_PREVIEW_FROM_FRAME, MD_PREVIEW_FROM_HOST } from "../../common/mdPreviewMessage.js";

/** Bytes of randomness behind a nonce. The guarantee it carries is that a `.md` cannot name it,
 *  so it is sized as a secret rather than as an id. */
const NONCE_BYTES = 16;

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

/** Whether a request asked for the embeddable document. Only the exact opt-in value counts: a
 *  stray `?embed=0` must not loosen a CSP, and anything else is a request for the plain one. */
export const wantsMdPreviewEmbed = (value: unknown): boolean => value === MD_PREVIEW_EMBED_ON;

/** A fresh nonce. `base64url` so the value is safe in a CSP source expression AND in an HTML
 *  attribute without escaping — a `+` or `/` from plain base64 is valid in both, but only by
 *  accident of two charsets happening to overlap. */
export const newPreviewNonce = (): string => randomBytes(NONCE_BYTES).toString("base64url");

/** The policy the embeddable document is served under.
 *
 *  `sandbox allow-scripts` and NOT `allow-same-origin`: scripts run in an opaque origin, which is
 *  the whole point — the document can talk to its host through `postMessage` and can reach
 *  nothing else. `script-src` with only the nonce is what keeps the FILE's scripts out; without
 *  it, `allow-scripts` would run whatever the markdown happens to contain.
 *
 *  Nothing else is restricted, so images and inline styles render exactly as they do under the
 *  plain `sandbox` — this policy is meant to differ from that one in one respect only. */
export const mdPreviewEmbedCsp = (nonce: string): string => `sandbox allow-scripts; script-src 'nonce-${nonce}'`;

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
 *  The two subtleties are both about a restore racing the document it is restoring INTO. This
 *  document sizes its images from the viewport and declares no dimensions, so it GROWS as they
 *  arrive: a place applied at parse time can be past the end of a page that is still short, and
 *  `scrollTo` clamps it. Hence the quiet window (the clamped position must not be reported back
 *  as the reader's) and the re-apply at `load` (by which point the page is its full height) —
 *  and the re-apply is skipped once the reader has scrolled for themselves, because from then on
 *  the remembered place is no longer where they are. */
const reporterSource = (): string =>
  [
    "(() => {",
    `const post = (message) => { parent.postMessage({ ...message, source: ${JSON.stringify(MD_PREVIEW_FROM_FRAME)} }, "*"); };`,
    "let place = null;",
    "let quietUntil = 0;",
    "let readerMoved = false;",
    "let pending = 0;",
    "const applyPlace = () => {",
    "  if (place === null) return;",
    `  quietUntil = Date.now() + ${RESTORE_SETTLE_MS};`,
    "  scrollTo(0, place);",
    "};",
    "addEventListener('scroll', () => {",
    "  if (pending || Date.now() < quietUntil) return;",
    "  pending = setTimeout(() => {",
    "    pending = 0;",
    "    if (Date.now() < quietUntil) return;",
    "    readerMoved = true;",
    '    post({ kind: "scroll", scrollY: Math.round(scrollY) });',
    `  }, ${SCROLL_REPORT_MS});`,
    "}, { passive: true });",
    "addEventListener('message', (event) => {",
    "  if (event.source !== parent) return;",
    "  const data = event.data;",
    `  if (!data || data.source !== ${JSON.stringify(MD_PREVIEW_FROM_HOST)} || typeof data.scrollY !== "number") return;`,
    "  place = data.scrollY;",
    "  applyPlace();",
    "});",
    "addEventListener('load', () => { if (!readerMoved) applyPlace(); });",
    'post({ kind: "ready" });',
    "})();",
  ].join("\n");

/** The reporter as a `<script>` element carrying the nonce that lets it run.
 *
 *  Appended to the rendered body rather than placed in the head: the document it measures has to
 *  exist before `scrollTo` means anything, and this way the embeddable document differs from the
 *  plain one by exactly one trailing element. */
export const mdPreviewReporterTag = (nonce: string): string => `<script nonce="${nonce}">${reporterSource()}</script>`;
