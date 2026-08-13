// The HTML a published app shows instead of the generated form.
//
// A form is enough to ANSWER something and not enough to CHOOSE from what is
// available, so an app may name one HTML file and the public page renders it in
// a sandboxed iframe (mulmoserver `PublicViewFrame`). What the page holds is
// Firebase; what the view holds is the drawing.
//
// Three things about this file are decisions rather than plumbing:
//
//   WHERE IT LIVES. `public.view.path` is resolved against the REPOSITORY
//   ROOT — `app.json` is there, and a path written in a file is naturally
//   relative to that file. The alternative, resolving it inside one
//   collection's skill folder, asks which collection owns a page that belongs
//   to the whole app, and has no answer for an app with three of them.
//
//   IT IS A SEPARATE DOCUMENT. Firestore's 1 MiB limit is per document and
//   HTML is the part that grows, so the page's `config/public` (which every
//   visitor reads to draw anything at all) is not made hostage to it.
//
//   IT MUST BE DELETED, not merely stopped being written. `config/{docId}` is
//   `allow read: if true` forever: withdraw `public.view` from the declaration
//   and the old page stays fetchable by anyone until something removes it.
import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";

import type { AuthoredApp } from "@mulmoclaude/core/collection/server";

/** The document the public page reads the HTML from. Beside core's
 *  `PUBLIC_CONFIG_DOC` ("public") under `apps/{aid}/config`. */
export const PUBLIC_VIEW_DOC = "view";

/** What publish writes there.
 *
 *  `publishedAt` is the same stamp `config/public` carries, and the runtime
 *  refuses to draw a pair that disagrees: the two are separate writes and a
 *  publish can stop between them, leaving a new declaration beside the previous
 *  page — a view handed fields it has never seen. */
export interface PublicViewDoc extends Record<string, unknown> {
  html: string;
  publishedAt: number;
}

/** How much of a Firestore document a published view may take.
 *
 *  The limit is 1 MiB and it applies to the DOCUMENT: field names, the UTF-8
 *  length of every string, and the document's own overhead. Measuring the file
 *  on disk would therefore be measuring the wrong thing — and being wrong here
 *  is not a smaller page but a refused write at publish time, or a page that
 *  cannot be updated.
 *
 *  The margin is deliberate. What is left of the megabyte is not ours to spend
 *  on being exact. */
const MAX_VIEW_BYTES = 900_000;

/** The bytes this document will occupy, near enough to refuse on.
 *
 *  Counted as the serialised document rather than as the HTML: the numbers a
 *  reader cares about — "how much have I got left" — must include everything
 *  the write carries, not just the part they wrote. */
export const viewDocumentBytes = (doc: PublicViewDoc): number => Buffer.byteLength(JSON.stringify(doc), "utf8");

export interface ViewFile {
  html: string;
  bytes: number;
}

export type ViewFileResult = { ok: true; view: ViewFile } | { ok: false; problems: string[] };

/** The host-side contract's name. A view written for the collection pane reads
 *  a capability token and a `dataUrl` off it, neither of which exists on the
 *  public page — so pointing `public.view` at one produces a blank page and no
 *  error anywhere. */
const HOST_VIEW_GLOBAL = "__MC_VIEW";

/** Read and judge the file `public.view.path` names.
 *
 *  Every refusal here is a thing the visitor would otherwise meet as an empty
 *  page: a path to nothing, a page too large to publish, or a view written
 *  against the host's bridge. */
export async function readPublicViewFile(root: string, view: { path: string }, publishedAt: number): Promise<ViewFileResult> {
  const inside = await containedPath(root, view.path);
  if (!inside.ok) return inside;
  const full = inside.full;
  const problems = await missingFileProblems(full, view.path);
  if (problems.length > 0) return { ok: false, problems };

  const html = await readFile(full, "utf8");
  const bytes = viewDocumentBytes({ html, publishedAt });
  return contentProblems(html, bytes, view.path) ?? { ok: true, view: { html, bytes } };
}

/** The file this path REALLY names, and only if it is still in the repository.
 *
 *  Not a second opinion about the declaration's shape — publish already refuses
 *  a path that is not one name under `views/`. This is about what the file
 *  system does with it: `..` normalises away silently, and a symlink no regex
 *  can see points wherever it likes. What is published lands on a document
 *  whose rule is `allow read: if true`, so a mistake here is not a broken page
 *  but somebody's `.env` handed to the world.
 *
 *  Both ends are resolved (`realpath`) before comparing, because a repository
 *  reached through a symlinked parent would otherwise fail this test while
 *  being entirely legitimate. */
async function containedPath(root: string, declared: string): Promise<{ ok: true; full: string } | { ok: false; problems: string[] }> {
  const real = await realpath(root).catch(() => path.resolve(root));
  const full = await realpath(path.resolve(real, declared)).catch(() => path.resolve(real, declared));
  if (full === real || full.startsWith(real + path.sep)) {
    return { ok: true, full };
  }
  return {
    ok: false,
    problems: [
      `public.view.path names '${declared}', which resolves outside this repository. ` +
        "A published view is one file inside it — what gets published is world-readable, so a path that leaves (through `..`, or through a symlink) would hand out whatever it landed on.",
    ],
  };
}

async function missingFileProblems(full: string, declared: string): Promise<string[]> {
  try {
    const info = await stat(full);
    if (info.isFile()) return [];
    return [`public.view.path names '${declared}', which is not a file.`];
  } catch {
    return [
      `public.view.path names '${declared}', which does not exist in this repository. ` +
        "The public page has nothing to draw and would tell a visitor there is nothing here.",
    ];
  }
}

function contentProblems(html: string, bytes: number, declared: string): { ok: false; problems: string[] } | null {
  if (bytes > MAX_VIEW_BYTES) {
    return {
      ok: false,
      problems: [
        `public.view.path names '${declared}', which comes to ${bytes.toLocaleString()} bytes as a Firestore document — over the ${MAX_VIEW_BYTES.toLocaleString()} this publishes. ` +
          "The hard limit is 1 MiB per document and it counts field names and string lengths, not the file on disk, so the margin is not spare room. " +
          "Move what is big out of the page: the datasets arrive from the app, not from the HTML.",
      ],
    };
  }
  if (html.includes(HOST_VIEW_GLOBAL)) {
    return {
      ok: false,
      problems: [
        `public.view.path names '${declared}', which reads \`${HOST_VIEW_GLOBAL}\` — that is the HOST's custom-view contract, where a view is handed a capability token and fetches its own data. ` +
          "The public page has neither: it reads Firestore itself and hands the view its data, and the view asks for writes through `window.__MC_PUBLIC_VIEW`. " +
          "Published as it stands, this page would render blank with nothing anywhere to say why. Write the public view against the public bridge.",
      ],
    };
  }
  return null;
}

/** The view the declaration asks to publish, if any. Null for an app with no
 *  `public.view` — which is most of them, and is not a problem. */
export const declaredView = (authored: AuthoredApp): { path: string } | null => authored.public?.view ?? null;
