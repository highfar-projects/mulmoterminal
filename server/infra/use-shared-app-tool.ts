// useSharedApp — the other side of `manageSharedApp`.
//
// That tool is the AUTHOR's: it operates on the repository the session is open in, and it publishes.
// This one operates on apps somebody else published, as one of the people they are for — a
// participant filling something in and moving their own row, or a member of the roster working the
// records their role carries. It needs no repository and never writes a declaration.
//
// IT ACTS AS THE SIGNED-IN PERSON, and that is the whole design (`plans/feat-shared-app-mcp.md`,
// M2/M3). Every read and every write goes out with the remote-host session's own credentials, so
// the deployed rules answer for the right principal. There is deliberately no service account
// anywhere near this: admin credentials bypass the rules entirely, which would turn off every
// guarantee `firestore.rules` holds and leave the host's own checks — diagnostics, by principle 2 —
// standing in their place.
//
// IT IS GENERIC. The vocabulary an app can be asked for is closed (`IntentKind` plus a create), so
// one tool covers every app that will ever be published; an app's own words appear as VALUES —
// collection ids, field names, status names — and never as actions here.
import type { ToolDefinition } from "gui-chat-protocol";
import { capabilitiesOn, joinApp, readRecords, submitCids, TIERS, worldReadable, type JoinedApp } from "../backends/sharedApp/participate/app.js";
import type { ViewCapability } from "@receptron/sharedapp/view";
import { performIntent } from "../backends/sharedApp/participate/intent.js";
import { submitPlan, submitToApp } from "../backends/sharedApp/participate/submit.js";
import { forgetApp, rememberApp, rememberedApps, type ForgetResult } from "../backends/sharedApp/participate/registry.js";
import { isRecord } from "../../common/isRecord.js";
import { MULMOSERVER_ORIGIN } from "../../common/firebaseConfig.js";

export const USE_SHARED_APP_ACTIONS = ["apps", "describe", "records", "submit", "transition", "assign", "withdraw", "forget"] as const;
export type UseSharedAppAction = (typeof USE_SHARED_APP_ACTIONS)[number];

const DEFAULT_LIMIT = 50;

/** The most rows one `records` call will ever ask for.
 *
 *  A ceiling rather than a preference. Without one, `limit: 1000000` is a finite number the schema
 *  accepts: it bills a read per row in somebody else's app and returns a result that has to travel
 *  through the MCP channel and into a context window. The number is inspection-sized on purpose —
 *  this tool is for looking at a collection and acting on a row, not for exporting one. */
const MAX_LIMIT = 500;

export const USE_SHARED_APP: ToolDefinition = {
  type: "function",
  name: "useSharedApp",
  description:
    "Take part in a shared app somebody published — one you were given a link to — as yourself: read what you may read, fill its form in, and move records your role or your own submission allows. " +
    "It works on any shared app without knowing anything about it in advance: `describe` reads the app's published declaration and reports the collections, the form and exactly what you may change.",
  prompt:
    "`useSharedApp` is for an app SOMEBODY ELSE published and you take part in. The author's side — writing app.json, previewing, publishing, inviting — is `manageSharedApp`, and this tool never does any of it.\n" +
    "Everything here happens AS THE SIGNED-IN USER of this machine. The deployed Firestore rules judge every read and write for that person, so what this tool can do is exactly what they could do on the app's own web page, and nothing more.\n" +
    '**apps** lists the apps this machine has been asked about before. There is NO index of "apps I belong to" anywhere — Firestore cannot be asked that question — so this list is a local memory that fills itself in as you use `describe`. An app missing from it is not an app you are not in; ask the user for the URL name.\n' +
    "**describe** is the first thing to run for any app, and it takes a `slug` (the URL name, the last part of https://…/a/<slug>). It reports the app's name, whether it is open to the world, the roles the roster gives you, what each collection lets you change, and the fields of any form it publishes. Run it before anything else — the rest of this tool takes the collection ids and field names it reports.\n" +
    "**records** lists a collection's rows. Read the `scope` it reports: `all` means the whole collection, `own` means the rules only let you see your own rows and this is them, `none` means nothing could be read and says why. Never describe an `own` list as the collection.\n" +
    "**submit** fills the app's form in, with `values` keyed by the field names `describe` reported. Send every answer as a STRING, including for a number, date or enum field — that is what the app's own web form sends, so the record matches. `describe` reports each field's type and an enum's choices; use them rather than guessing. It writes a REAL record in somebody else's app, so confirm the values with the user first.\n" +
    "**transition** moves a record's status (`to` names the new one). **assign** hands a record to somebody (`to` is their address, and it must be one `describe` listed as assignable). **withdraw** DELETES the record — it is how a submitter takes their own entry back, it frees whatever slot the entry was holding, and there is no undo. Ask before every one of these.\n" +
    "A transition can queue a real notification email to a real person, in the same write. The report says when one was queued; do not describe a move as private.\n" +
    "**forget** drops an app from the local list. It changes nothing in the app itself.\n" +
    "TWO THINGS THIS TOOL WILL NOT TELL YOU, and you must not fill them in.\n" +
    "A successful `submit` is not a place, a seat or a booking held. Capacity in a shared app is derived from ORDER — the rules cannot count rows — so what a create buys is a position in a queue, which the app's own staff interpret. Report what was written and, if the user asks where they stand, read the collection; never say a slot is secured.\n" +
    "And a refusal from this tool names the DECLARATION, not the rules: `illegal-transition` means the published table does not carry that move, `not-permitted` means your role does not carry it, `unknown-assignee` means the address holds no assignable role. The rules are the authority and they answer last — a write can still be refused after this tool judged it fine, and that refusal is reported as it arrived.",
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: [...USE_SHARED_APP_ACTIONS],
        description:
          "apps = the local list; describe = read one app's published declaration and what you may do in it; records = list a collection's rows; " +
          "submit = fill the form in; transition / assign / withdraw = move, hand over or delete one record; forget = drop an app from the local list.",
      },
      slug: { type: "string", description: "The app's URL name — the last part of https://…/a/<slug>. Required by everything except `apps`." },
      cid: { type: "string", description: "The collection, as `describe` reported it." },
      id: { type: "string", description: "The record's id, as `records` reported it. transition / assign / withdraw." },
      to: {
        type: "string",
        description: "transition: the status to move to. assign: the address to hand the record to. Not used by withdraw, which moves nothing.",
      },
      values: {
        type: "object",
        description:
          "submit: the form's answers, keyed by the field names `describe` reported. Every value is a STRING and is sent as written — including the answer to a number, date or enum field, which is exactly what the app's own web form sends for those. A value of another JSON type is dropped rather than converted, because converting it would write a different document than the page would.",
        additionalProperties: true,
      },
      limit: {
        type: "number",
        description: `records: how many rows at most (default ${DEFAULT_LIMIT}, ceiling ${MAX_LIMIT} — a larger ask is lowered and the report says so).`,
      },
    },
    required: ["action"],
  },
};

const parseAction = (raw: unknown): UseSharedAppAction | null =>
  typeof raw === "string" ? (USE_SHARED_APP_ACTIONS.find((action) => action === raw) ?? null) : null;

const str = (value: unknown): string | undefined => (typeof value === "string" && value.length > 0 ? value : undefined);

/** The form's answers, narrowed to strings.
 *
 *  A STRING IS WHAT A SUBMISSION IS, everywhere — not a limitation of this tool. `recordOf` in
 *  `@receptron/sharedapp/view` takes `Record<string, string>` and writes each value verbatim, and
 *  mulmoserver's own page hands it exactly that (`usePublicSubmit.ts`): a `number` field filled in
 *  on the live public form lands in Firestore as the string that was typed. So a typed field IS
 *  submittable here, and it lands as the same document the page would have written.
 *
 *  Which is why a non-string argument is DROPPED rather than coerced. Converting `42` to `42` (a
 *  JSON number) would make this host write a DIFFERENT document from the page for the same answer —
 *  read differently by the app's own views, and by any rule testing `is string`. This host does not
 *  get to decide a field's storage type on the author's behalf. A dropped required field is
 *  reported by name through `missingRequired`, never silently. */
const values = (raw: unknown): Record<string, string> => {
  if (!isRecord(raw)) return {};
  return Object.fromEntries(Object.entries(raw).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
};

/** One collection's capability, as a list of things a person could be told they may do.
 *
 *  Empty means "nothing", which the caller drops: a line saying a collection allows nothing is
 *  noise on an app where most collections allow nothing to most readers. */
function capabilityParts(can: ViewCapability): string[] {
  const parts: string[] = [];
  if (can.transitionAny) parts.push("move any row's status");
  if (can.transitionOwn) parts.push(`move the status of rows assigned to you (${can.assigneeField ?? "assignee field not published"})`);
  if (can.assign) parts.push(`assign rows to: ${can.assignees.join(", ")}`);
  if (can.withdrawFrom.length > 0) parts.push(`withdraw your own row while it is: ${can.withdrawFrom.join(" / ")}`);
  if (can.withdrawAny) parts.push("delete any row");
  return parts;
}

/** What each collection lets this reader change, said in the app's own words. */
function capabilityLines(app: JoinedApp): string[] {
  const lines: string[] = [];
  for (const tier of TIERS) {
    if (app.writes[tier] === undefined) continue;
    for (const [cid, can] of Object.entries(capabilitiesOn(app, tier))) {
      const parts = capabilityParts(can);
      if (parts.length > 0) lines.push(`  - ${cid} (${tier}): ${parts.join("; ")}`);
    }
  }
  if (lines.length === 0)
    lines.push("  - nothing. Either you hold no role that carries a write here, or the app published no page for the tier that would carry one.");
  return lines;
}

/** The transitions the published tables carry, so an agent has the status names without guessing. */
function transitionLines(app: JoinedApp): string[] {
  const lines: string[] = [];
  for (const tier of TIERS) {
    for (const write of app.writes[tier] ?? []) {
      const table = write.transitions;
      if (table === undefined || Object.keys(table).length === 0) continue;
      const moves = Object.entries(table)
        .map(([from, to]) => `${from} -> ${to.join(" / ")}`)
        .join(", ");
      lines.push(`  - ${write.cid} (${tier}, field "${write.statusField ?? "?"}"): ${moves}`);
    }
  }
  return lines;
}

/** One input, with everything the published form says about it.
 *
 *  The type and an enum's choices are here because an agent without them GUESSES: it fills a
 *  select in from the field's name and sends prose to a date. Both are accepted by the rules and
 *  useless to the app, which is a worse outcome than a refusal. */
function describedField(field: { name: string; label: string; required: boolean }, hint: { type?: string; values?: string[] } | undefined): string {
  const about = [field.label, ...(hint?.type === undefined ? [] : [hint.type]), ...(hint?.values === undefined ? [] : [`one of: ${hint.values.join(" / ")}`])];
  return `${field.name}${field.required ? "*" : ""} (${about.join(", ")})`;
}

function formLines(app: JoinedApp): string[] {
  const cids = submitCids(app);
  if (cids.length === 0) return [];
  const lines = ["Form (submit):"];
  for (const cid of cids) {
    const plan = submitPlan(app, cid);
    if (plan === null) {
      lines.push(`  - ${cid}: declared, but this app published no form for it — nothing here can say which fields to send.`);
      continue;
    }
    const fields = plan.fields.map((field) => describedField(field, plan.hints[field.name])).join(", ");
    lines.push(`  - ${cid}: ${fields.length === 0 ? "no fields — submitting is the whole answer" : fields}`);
  }
  lines.push("  (* required. Fields the host fills in — your address, your uid, the initial status, the server stamp — are not listed and must not be sent.)");
  return lines;
}

async function narrateDescribe(slug: string): Promise<string> {
  const joined = await joinApp(slug);
  if (!joined.ok) return joined.problems.join("\n");
  const app = joined.app;
  await rememberApp({ slug: app.slug, aid: app.aid, ...(app.name === undefined ? {} : { name: app.name }) });
  const roles =
    app.roles === undefined
      ? "Your roles: not readable — the app document is open only to people holding an app-wide role, so a role scoped to one collection cannot read it. What you may do is below either way."
      : `Your roles: ${Object.entries(app.roles)
          .map(([where, role]) => `${role} of ${where === "*" ? "the whole app" : where}`)
          .join(", ")}`;
  const readable = worldReadable(app);
  return [
    `${app.name ?? slug} — ${MULMOSERVER_ORIGIN}/a/${slug} (aid ${app.aid})`,
    app.published ? "Open to anyone with the link." : "NOT open to the public — it answers only to people on its roster.",
    roles,
    readable.length > 0 ? `World-readable collections: ${readable.join(", ")}` : "No collection is world-readable.",
    "You may:",
    ...capabilityLines(app),
    ...(transitionLines(app).length === 0 ? [] : ["Declared transitions:", ...transitionLines(app)]),
    ...formLines(app),
  ].join("\n");
}

async function narrateApps(): Promise<string> {
  const known = await rememberedApps();
  if (known.length === 0)
    return (
      'No shared apps are remembered on this machine yet. There is no index of "apps I belong to" to consult — ask the user for a URL name ' +
      "(the last part of https://…/a/<slug>) and run `describe` on it; it is remembered from then on."
    );
  return [
    "Remembered on this machine (a local list, not a membership record):",
    ...known.map((entry) => (entry.name === undefined ? `  - ${entry.slug}` : `  - ${entry.slug} — ${entry.name}`)),
    "Run `describe` on one to see what you may do in it now; roles and declarations change with every publish.",
  ].join("\n");
}

/** WHAT WAS LEFT OUT, said rather than left to be inferred from a count.
 *
 *  Two cases and they are different sentences: an ask this tool would not make, and a page that
 *  filled up exactly. Both are read by an agent as "that is the collection" when nothing says
 *  otherwise, and a row count is the least reliable thing to infer completeness from. */
function whatIsMissing(limit: { rows: number; asked?: number }, got: number): string[] {
  if (limit.asked !== undefined) return [`You asked for ${limit.asked} rows; this tool reads at most ${MAX_LIMIT} at a time. There may be more.`];
  if (got === limit.rows) return ["That is as many as were asked for, so there may be more."];
  return [];
}

async function narrateRecords(slug: string, cid: string | undefined, limit: { rows: number; asked?: number }): Promise<string> {
  if (cid === undefined) return "useSharedApp records: `cid` is required — run `describe` to see which collections this app has.";
  const joined = await joinApp(slug);
  if (!joined.ok) return joined.problems.join("\n");
  const read = await readRecords(joined.app, cid, limit.rows);
  if (read.scope === "none") return `Nothing readable in "${cid}": ${read.note}.`;
  const header =
    read.scope === "all"
      ? `${read.rows.length} row(s) in "${cid}" — the whole collection, as far as the rules opened it.`
      : `${read.rows.length} row(s) in "${cid}" — YOUR OWN ONLY (${read.note}). This is not the collection; do not describe it as one.`;
  return [header, ...whatIsMissing(limit, read.rows.length), JSON.stringify(read.rows, null, 2)].join("\n");
}

async function narrateSubmit(slug: string, cid: string | undefined, given: Record<string, string>): Promise<string> {
  if (cid === undefined) return "useSharedApp submit: `cid` is required — run `describe` to see which collections take submissions.";
  const joined = await joinApp(slug);
  if (!joined.ok) return joined.problems.join("\n");
  const result = await submitToApp(joined.app, cid, given);
  if (!result.ok) {
    if (result.reason === "taken")
      return `Refused: something with that id already exists in "${cid}". Where the id IS the thing being claimed — a slot, a seat, one answer per person — that means somebody has it, and it may be you.`;
    return `Not submitted (${result.reason}): ${result.error}`;
  }
  return [
    `Submitted to "${cid}" as ${joined.app.handle.email}. The record's id is ${result.id}.`,
    ...(result.mirror === undefined ? [] : [`It claimed ${result.mirror.cid}/${result.mirror.id} in the same write.`]),
    "That is a record written, not a place held: a shared app cannot count rows in its rules, so where the app has a limit it is worked out from ORDER. " +
      "Read the collection if the user wants to know where they stand.",
  ].join("\n");
}

async function narrateIntent(
  slug: string,
  action: "transition" | "assign" | "withdraw",
  cid: string | undefined,
  id: string | undefined,
  to: string | undefined,
): Promise<string> {
  if (cid === undefined || id === undefined) return `useSharedApp ${action}: \`cid\` and \`id\` are both required — \`records\` reports them.`;
  if (action !== "withdraw" && to === undefined)
    return `useSharedApp ${action}: \`to\` is required — the status to move to, or the address to hand the record to.`;
  const joined = await joinApp(slug);
  if (!joined.ok) return joined.problems.join("\n");
  const result = await performIntent(joined.app, { kind: action, cid, itemId: id, to });
  if (!result.ok) return `Refused: ${result.error}`;
  const what = performed(action, cid, id, to);
  return [
    what,
    `Judged on the ${result.tier} tier and performed by the deployed rules as ${joined.app.handle.email}.`,
    ...(result.mailed ? ["A notification was QUEUED in the same write — real mail, to a real person. It cannot be recalled."] : []),
  ].join("\n");
}

/** What just happened, in the app's terms. Withdrawal says the most because it is the one that
 *  cannot be taken back: the record is gone and whatever it was holding is on offer again. */
function performed(action: "transition" | "assign" | "withdraw", cid: string, id: string, to: string | undefined): string {
  if (action === "withdraw") return `Withdrew ${cid}/${id}. The record is gone; any slot it was holding is open again. There is no undo.`;
  if (action === "assign") return `Assigned ${cid}/${id} to ${to}.`;
  return `Moved ${cid}/${id} to "${to}".`;
}

/** What a `forget` did. The failure is SAID rather than swallowed: this is the whole of what was
 *  asked, so answering "forgotten" about an entry still on disk would be the report lying. */
function narrateForget(slug: string, result: ForgetResult): string {
  if (result === "forgotten") return `Forgot "${slug}". Nothing in the app itself changed.`;
  if (result === "not-known") return `"${slug}" was not in the local list. Nothing changed.`;
  return `"${slug}" is still in the local list — it could not be written: ${result.failed}. Nothing in the app itself changed either way.`;
}

/** How many rows to ask for, and never fewer than one.
 *
 *  THE FLOOR IS THE POINT. `Math.floor` of a fraction the schema happily accepts — `0.5` is a valid
 *  JSON number — is `0`, and `limit(0)` is not a smaller request: Firestore REFUSES it, and it
 *  refuses at the moment the constraint is built, which is before the read this file wraps in a
 *  `catch`. So a caller asking for half a row would get an exception where every other bad argument
 *  gets a sentence. Clamped rather than refused, because there is no reading of "0.5 rows" that the
 *  user needs told about — they wanted some rows. */
function rowCap(raw: unknown): { rows: number; asked?: number } {
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 1) return { rows: DEFAULT_LIMIT };
  const wanted = Math.max(1, Math.floor(raw));
  // The ask is CARRIED when it was lowered, so the report can say so. A cap applied silently reads
  // as "that is the whole collection", which is the one thing a row count must never imply.
  return wanted > MAX_LIMIT ? { rows: MAX_LIMIT, asked: wanted } : { rows: wanted };
}

/** Run one action and narrate it. The agent's whole contract with this tool is actionable prose, so
 *  a refusal is text and never a throw. */
export async function useSharedApp(args: unknown): Promise<string> {
  const body = isRecord(args) ? args : {};
  const action = parseAction(body.action);
  if (action === null) return `useSharedApp: action must be one of ${USE_SHARED_APP_ACTIONS.join(", ")}.`;
  if (action === "apps") return narrateApps();

  const slug = str(body.slug);
  if (slug === undefined) return `useSharedApp ${action}: \`slug\` is required — the app's URL name, the last part of https://…/a/<slug>.`;
  if (action === "forget") return narrateForget(slug, await forgetApp(slug));

  const cid = str(body.cid);
  if (action === "describe") return narrateDescribe(slug);
  if (action === "records") return narrateRecords(slug, cid, rowCap(body.limit));
  if (action === "submit") return narrateSubmit(slug, cid, values(body.values));
  return narrateIntent(slug, action, cid, str(body.id), str(body.to));
}
