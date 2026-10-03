// The fork source — `config/fork` and one `config/fork:view:{id}` per page — written when the app
// declares `forkable`, and withdrawn when it stops (receptron/mulmoserver#332).
//
// `config/*` is world-readable, so this is the one place publish puts the STAFF pages where anyone
// can read them: the copy a visitor makes is made of them. That is what declaring `forkable` agrees
// to, and why the source is refused while it names anybody on the roster (`forkSourceProblems`).
import {
  FORK_SOURCE_DOC,
  appConfigPath,
  forkSourceProblems,
  forkViewDocId,
  normalizeViews,
  projectForkSource,
  type AuthoredApp,
  type ForkSourceDoc,
  type PublishStamp,
} from "@receptron/sharedapp";
import type { CollectionSchema } from "@mulmoclaude/core/collection";

import type { SharedAppFailure, SharedAppHandle } from "./context.js";
import type { PublicForm } from "./publicForm.js";
import type { PlannedTier } from "./appViews.js";
import type { ViewFile } from "./publicView.js";
import type { WriteStep } from "./writes.js";

/** The same ceiling a published page has: one Firestore document, with room to spare. */
const MAX_FORK_SOURCE_BYTES = 900_000;
const FORK_VIEW_PREFIX = forkViewDocId("");

interface ForkPage {
  id: string;
  html: string;
}

/** What publish will write, and which fork documents already there it must remove. `source` is null
 *  when the app is not forkable — every fork document then goes. */
export interface ForkPlan {
  source: ForkSourceDoc | null;
  pages: ForkPage[];
  stale: string[];
}

interface ForkInput {
  authored: AuthoredApp;
  schemas: { cid: string; schema: CollectionSchema }[];
  form: PublicForm;
  view: ViewFile | null;
  tiers: readonly PlannedTier[];
  stamp: PublishStamp;
}

/** Every page the copy is made of: the public one and every tier's. */
function pagesOf(authored: AuthoredApp, view: ViewFile | null, tiers: readonly PlannedTier[]): ForkPage[] {
  const normalized = normalizeViews(authored);
  const publicId = normalized.ok ? normalized.views.find((entry) => entry.audience === "public")?.id : undefined;
  const publicPage = view === null || publicId === undefined ? [] : [{ id: publicId, html: view.html }];
  return [...publicPage, ...tiers.flatMap(({ plan }) => plan.pages)];
}

/** Refusals for a forkable app — before anything is written, like the rest of publish's gate. */
function sourceProblems(authored: AuthoredApp, source: ForkSourceDoc, pages: ForkPage[]): string[] {
  const named = forkSourceProblems(authored, source, pages);
  const bytes = Buffer.byteLength(JSON.stringify(source), "utf8");
  const oversize =
    bytes <= MAX_FORK_SOURCE_BYTES
      ? []
      : [
          `the copy offered by \`forkable\` comes to ${Math.round(bytes / 1000)} kB, over the one-document limit. Shorten the schemas or the public form, or drop \`forkable\`.`,
        ];
  return [...named, ...oversize];
}

async function existingForkDocs(handle: SharedAppHandle, aid: string): Promise<{ ok: true; ids: string[] } | SharedAppFailure> {
  try {
    const docs = await handle.docs.list(appConfigPath(aid));
    return { ok: true, ids: docs.map((doc) => doc.id).filter((id) => id === FORK_SOURCE_DOC || id.startsWith(FORK_VIEW_PREFIX)) };
  } catch (err) {
    return {
      ok: false,
      partial: false,
      problems: [
        `publish failed while reading apps/${aid}/config: ${err instanceof Error ? err.message : String(err)}`,
        "Nothing was written. This read is what lets a copy that is no longer offered be removed.",
      ],
    };
  }
}

export async function planFork(handle: SharedAppHandle, aid: string, input: ForkInput): Promise<{ ok: true; plan: ForkPlan } | SharedAppFailure> {
  const existing = await existingForkDocs(handle, aid);
  if (!existing.ok) return existing;
  if (input.authored.forkable !== true) return { ok: true, plan: { source: null, pages: [], stale: existing.ids } };
  const pages = pagesOf(input.authored, input.view, input.tiers);
  const source = { ...projectForkSource(input.authored, input.schemas, input.stamp.publishedAt), form: input.form };
  const problems = sourceProblems(input.authored, source, pages);
  if (problems.length > 0) return { ok: false, partial: false, problems };
  const keep = new Set([FORK_SOURCE_DOC, ...pages.map((page) => forkViewDocId(page.id))]);
  return { ok: true, plan: { source, pages, stale: existing.ids.filter((id) => !keep.has(id)) } };
}

/** The pages first and the source last, so a source never names a page that is not there yet; the
 *  withdrawals after, with the source first among them, so a half-withdrawn copy is one nobody is
 *  offered. */
export function forkWrites(handle: SharedAppHandle, aid: string, plan: ForkPlan, publishedAt: number): WriteStep[] {
  const at = appConfigPath(aid);
  const pages = plan.pages.map((page) => ({
    what: `the forkable copy of page '${page.id}' (${at}/${forkViewDocId(page.id)})`,
    run: () => handle.docs.set(at, forkViewDocId(page.id), { html: page.html, publishedAt }),
  }));
  const forkSource = plan.source;
  const source =
    forkSource === null ? [] : [{ what: `the forkable copy (${at}/${FORK_SOURCE_DOC})`, run: () => handle.docs.set(at, FORK_SOURCE_DOC, forkSource) }];
  const withdrawn = [...plan.stale].sort((left, right) => Number(right === FORK_SOURCE_DOC) - Number(left === FORK_SOURCE_DOC));
  const removals = withdrawn.map((id) => ({
    what: `removing ${at}/${id}`,
    run: async () => {
      await handle.docs.delete(at, id);
    },
  }));
  return [...pages, ...source, ...removals];
}
