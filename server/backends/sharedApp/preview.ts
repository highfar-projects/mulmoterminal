// preview — everything publish would write, computed and NOT written.
//
// The author's page is written by an LLM and, until this existed, was never run before it went
// out. This is the place it runs: the author's own machine, before the first byte reaches
// Firestore.
//
// Three properties are load-bearing, and each of them is a way this could have been easier and
// wrong (design: `plans/feat-shared-app-preview.md`):
//
//   IT PROJECTS THROUGH `projectPublish`, not `projectDeploy` and not the working tree. What a
//   visitor's page reads is the PROJECTION — never the files in the repository — so a preview that
//   handed the iframe the declaration would draw collections `public.read` does not open, fields
//   publish would drop, and a config shaped unlike the published one. The two projections are also
//   not interchangeable with each other: they disagree about unknown keys, so drawing from the
//   deploy face would render something no visitor will ever see.
//
//   IT WRITES NOTHING. `projectDeploy(...).staging` is what a deploy would have put under
//   `apps/{aid}/staging`, taken as a value and passed straight to `projectPublish` in place of a
//   read. That is the whole trick, and it is why the two-stage write survives untouched: the stages
//   are still there, this run simply does not perform them.
//
//   IT REQUIRES NO SLUG. `appSlugs/{slug}` is one of the three writes that cannot be taken back,
//   and it is the scarce one — the name comes out of a namespace everybody shares, and nothing can
//   ask whether one is free without consuming it. A preview that reserved a name would burn one per
//   abandoned app. So the name is publish's business; this runs before it (principle 9).
//
// What this does NOT prove is in the plan and belongs in whatever reports it: the rules do not run
// here, other people's devices do not exist here, nothing is concurrent here, and — the one that
// hides best — whether the rules a new declaration needs are deployed at all.
import {
  appSchemasPath,
  projectDeploy,
  projectPublish,
  type AuthoredApp,
  type PublishStamp,
  type PublishedConfigDoc,
  type StagedSchemaDoc,
} from "@receptron/sharedapp";
import { readCurrentApp, schemasOf, sharedAppContext, stampFor, type SharedAppFailure, type SharedAppHandle, type SharedAppOptions } from "./context.js";
import { planAppViewTiers, type TierPlan } from "./appViews.js";
import { publicFormOf, type PublicForm } from "./publicForm.js";
import { declaredView, readAppViewFile } from "./publicView.js";
import { isRecord } from "../../../common/isRecord.js";

/** One page as the preview will render it: the id a host names it by, and the author's HTML. */
export interface PreviewPage {
  id: string;
  html: string;
}

export interface PreviewSuccess {
  ok: true;
  aid: string;
  /** `config/public` as this publish would write it — the document the anonymous page reads. */
  config: PublishedConfigDoc;
  /** The generated form's inputs, for an app that publishes a form rather than a page. */
  form: PublicForm;
  /** The page at `/a/{slug}`, or null when the app publishes no public view. */
  publicPage: PreviewPage | null;
  /** The pages at `/m/{slug}` and `/p/{slug}`, with the config each tier's parent needs in order
   *  to query for its datasets. Empty when the declaration names no pages for that audience. */
  tiers: TierPlan[];
  /** Whether this publish would leave the app open to anonymous visitors. False is normal: an app
   *  with no `public` block is one only its roster ever sees. */
  publicOpen: boolean;
  /** What was read out of `apps/{aid}`, or null when there is nothing there yet — which is the
   *  ordinary state of an app being previewed for the first time.
   *
   *  Said out loud because the projection DEPENDS on it: keys publish does not own are carried
   *  forward from the live document, so a preview computed without one is the projection of a
   *  FIRST publish, not of the next one. */
  fromLiveApp: boolean;
  /** The app's REAL records, per collection, for the collections the projection opens.
   *
   *  Real rather than generated from the declaration, and this is a decision rather than
   *  convenience: an app's records live in Firebase and nowhere else, so a second source on this
   *  machine would be one more thing that can agree with the author's screen and disagree with a
   *  visitor's. The author reads them with their own credentials, as the owner they already are,
   *  and nothing is written. An empty collection draws an empty page — which is a state worth
   *  seeing rather than a gap to fill with samples. */
  datasets: Record<string, Record<string, unknown>[]>;
  /** Collections the projection opens but whose records could not be read. Reported rather than
   *  silently empty: "no bookings yet" and "the read was refused" put identical pixels on the
   *  screen and mean opposite things to the author. */
  unreadable: string[];
  /** Pages that will go out but are worth looking at first — see `viewWarnings`. */
  warnings: string[];
}

export type PreviewResult = PreviewSuccess | SharedAppFailure;

/** What a deploy would stage, as a value. Nothing is written and nothing is read back: this is the
 *  same function deploy calls, asked for its answer instead of its effect. */
function stagedFromWorkingTree(
  authored: AuthoredApp,
  collections: Parameters<typeof schemasOf>[0],
  stamp: PublishStamp,
  existing: Record<string, unknown> | null,
): { cid: string; doc: StagedSchemaDoc }[] {
  return projectDeploy(authored, schemasOf(collections), stamp, existing).staging;
}

/** The app's records for one set of collections, read with the author's own credentials.
 *
 *  A refusal is carried back rather than thrown. The most common one is the ordinary state of an
 *  app that has never been deployed — `apps/{aid}` does not exist, so the rules cannot resolve an
 *  owner for anything beneath it — and refusing to preview at all because there are no records yet
 *  would make the feature useless exactly when it is most wanted. */
async function readDatasets(
  handle: SharedAppHandle,
  aid: string,
  cids: readonly string[],
): Promise<{ datasets: Record<string, Record<string, unknown>[]>; unreadable: string[] }> {
  const datasets: Record<string, Record<string, unknown>[]> = {};
  const unreadable: string[] = [];
  for (const cid of cids) {
    try {
      const docs = await handle.docs.list(`${appSchemasPath(aid)}/${cid}/items`);
      // The id is put ON the record. The rules use the document id as the record's identity
      // (a booking's id IS its slot), and a page that renders a list needs it as a field.
      datasets[cid] = docs.map((doc) => ({ ...(isRecord(doc.data) ? doc.data : {}), id: doc.id }));
    } catch {
      unreadable.push(cid);
    }
  }
  return { datasets, unreadable };
}

export async function previewSharedApp(root: string, opts: SharedAppOptions = {}): Promise<PreviewResult> {
  const context = await sharedAppContext(root);
  if (!context.ok) return context;
  const { authored, collections, handle } = context;
  const { aid } = authored;

  // Best effort, and a failure here is NOT fatal. A first preview runs against an app that does not
  // exist, and the rules answer that read with a denial rather than an absence (see
  // `readCurrentApp`) — so "cannot read it" and "there is nothing there" arrive as the same answer,
  // and both mean the same thing for a projection: there is nothing to carry forward.
  const current = await readCurrentApp(handle, aid, "preview", "Nothing is written by a preview.");
  const existingApp = current.ok ? current.app : null;

  const { stamp } = await stampFor(handle, root, opts);
  const staged = stagedFromWorkingTree(authored, collections, stamp, existingApp);
  const face = projectPublish(authored, staged, stamp, existingApp);

  const view = declaredView(authored);
  const page = view === null ? null : await readAppViewFile(root, view, stamp.publishedAt);
  if (page !== null && !page.ok) return { ok: false, partial: false, problems: page.problems };

  const tiers = await planAppViewTiers(root, authored, stamp);
  if (!tiers.ok) return { ok: false, partial: false, problems: tiers.problems };

  // WHICH collections, asked of the PROJECTION rather than of the declaration. `public.read` is
  // what a visitor may see; a preview that read everything on disk would draw a page the author
  // cannot ship, and the gap would show up for the first time in somebody else's browser.
  const { datasets, unreadable } = await readDatasets(handle, aid, face.config.view?.collections ?? face.config.read);

  return {
    ok: true,
    aid,
    config: face.config,
    form: publicFormOf(authored, staged),
    publicPage: page === null || !page.ok ? null : { id: "public", html: page.view.html },
    tiers: tiers.plans,
    publicOpen: face.public !== undefined,
    fromLiveApp: existingApp !== null,
    datasets,
    unreadable,
    warnings: [...(page !== null && page.ok ? page.view.warnings : []), ...tiers.warnings],
  };
}
