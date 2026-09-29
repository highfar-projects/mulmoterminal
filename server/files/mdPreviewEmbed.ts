// The EMBEDDABLE Markdown preview: the same rendering the new-tab view gets, plus the one script
// that can answer "where is the reader in this document" (#2157).
//
// The document has always been served under `Content-Security-Policy: sandbox` — no origin, no
// scripts — and that is what contains a `.md` this server never sanitised. Reading a scroll
// offset out of it needs SOMETHING to run inside, and the cheap way to get that is
// `allow-same-origin`, which puts unsanitised markdown on the app's own origin for good. This
// module takes the other road: the document stays opaque forever, and `script-src` with a
// per-response nonce lets exactly one script run — the one written in mdPreviewReporter.ts.
//
// So the file's own `<script>` and `onerror=` stay dead, because they carry no nonce and
// `'unsafe-inline'` is absent. Two things must hold for that to remain true, and both are pinned
// by this module's spec: the nonce is unguessable and fresh per response, and nothing derived
// from the file is ever interpolated into the script.
//
// Pure except for `newPreviewNonce`, which is the one value that must not be predictable.
import { randomBytes } from "node:crypto";
import { MD_PREVIEW_EMBED_ON } from "../../common/mdPreviewMessage.js";

/** Bytes of randomness behind a nonce. The guarantee it carries is that a `.md` cannot name it,
 *  so it is sized as a secret rather than as an id. */
const NONCE_BYTES = 16;

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
