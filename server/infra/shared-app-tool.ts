// manageSharedApp — MulmoTerminal's own tool for the three shared-app operations.
//
// It is NOT an action on `manageCollection`. That tool's definition and dispatch both live in
// `@mulmoclaude/core`, so adding to it would be a change to MulmoClaude for a feature only
// MulmoTerminal has — the boundary this design fixed (D5). Core keeps the pure half: parsing the
// declaration, deciding what is wrong with it, projecting documents. What is here, and in
// `server/backends/sharedApp/`, is the operation: the order the documents are written in, and
// what a half-finished write leaves behind.
//
// There is exactly ONE write path to a shared app, and this is it. Core's whole-app `publishApp`
// was deleted rather than left unused (mulmoclaude #2871) because MulmoTerminal declares the
// shared-collections capability and binds the Firestore accessor — an action left in core would
// simply work here, and it wrote `public` without ever passing through staging.
import type { ToolDefinition } from "gui-chat-protocol";
import { deploySharedApp } from "../backends/sharedApp/deploy.js";
import { publishSharedApp } from "../backends/sharedApp/publish.js";
import { unpublishSharedApp } from "../backends/sharedApp/unpublish.js";
import { isRecord } from "../../common/isRecord.js";

export const SHARED_APP_ACTIONS = ["deploy", "publish", "unpublish"] as const;
export type SharedAppAction = (typeof SHARED_APP_ACTIONS)[number];

export const MANAGE_SHARED_APP: ToolDefinition = {
  type: "function",
  name: "manageSharedApp",
  description:
    "Deploy, publish or unpublish this repository's shared app (the one declared by its app.json). " +
    "deploy stages the declaration and the collection schemas where only the app's roster can see them; publish promotes what was staged and opens the app to the public; unpublish closes it again.",
  prompt:
    "`manageSharedApp` operates on the repository the session is open in — the one holding `app.json` — and it is the only way to write a shared app.\n" +
    "**deploy** is the safe one and is meant to be run often. It writes the roster and internal settings to `apps/{aid}` and each collection's schema to `apps/{aid}/staging/{cid}`, which only people on the roster can read. " +
    "An invitation added to `members` takes effect at deploy, so the roster can try the real app at `/staging/{aid}` before anybody outside sees it. Deploy never opens the app to the public, and never changes what a published app's visitors are looking at.\n" +
    "**publish** is the dangerous one. It promotes the STAGED schemas — not the working tree, so what ships is what the roster reviewed — and then opens the app. Publish it only when the user asks for it in those terms.\n" +
    "**unpublish** closes the app to the public and leaves the promoted schemas in place, so publishing again is a promotion rather than a rebuild.\n" +
    "Both deploy and publish refuse when live records would not satisfy the schema being written, and list the records. `confirm: true` overrides that refusal — ask the user first, and note that confirming a deploy does NOT carry over to publish: the second refusal is about the same records reaching everyone.",
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: [...SHARED_APP_ACTIONS],
        description: "deploy = stage for the roster; publish = promote the staged version and open it; unpublish = close it again.",
      },
      confirm: {
        type: "boolean",
        description:
          "Write the schema although live records do not satisfy it. Applies to deploy and publish separately — a confirmed deploy still meets publish's own refusal.",
      },
    },
    required: ["action"],
  },
};

function parseAction(raw: unknown): SharedAppAction | null {
  if (typeof raw !== "string") return null;
  return SHARED_APP_ACTIONS.find((action) => action === raw) ?? null;
}

/** A stamp line both successes end with, because "which commit is this?" is the first question
 *  asked of a shared app that behaves unexpectedly — and `dirty` is the answer that matters, a
 *  commit that does not describe what was written being worse than no commit at all. */
function provenance(commit: string | undefined, dirty: boolean): string {
  if (commit === undefined) return "No commit was recorded (no git, or no commits yet).";
  return dirty ? `Recorded commit ${commit}, but the working tree was MODIFIED — the commit does not describe what was written.` : `Recorded commit ${commit}.`;
}

/** " at /sakura-hair", or nothing. Two of these rather than an inline conditional inside a
 *  template, because a sentence that reads well with and without the clause is the only thing
 *  worth optimising here. */
const at = (slug: string | undefined): string => (slug === undefined ? "" : ` at /${slug}`);

const noLonger = (slug: string | undefined): string => (slug === undefined ? "" : `, /${slug} no longer resolves`);

function recordNote(issues: number, capped: boolean): string[] {
  if (issues === 0) return [];
  const count = capped ? `at least ${issues}` : String(issues);
  return [`${count} live record${issues === 1 ? "" : "s"} do not satisfy the schema that was just written (you confirmed this) — they need repairing.`];
}

async function narrateDeploy(root: string, confirm: boolean): Promise<string> {
  const result = await deploySharedApp(root, { confirm });
  if (!result.ok) return result.problems.join("\n");
  const plural = result.cids.length === 1 ? "" : "s";
  return [
    `${result.created ? "Created" : "Updated"} apps/${result.aid} and staged ${result.cids.length} collection${plural}: ${result.cids.join(", ") || "(none)"}.`,
    `The roster can try it at /staging/${result.aid}. Nothing is public until you publish.`,
    ...(result.slug === undefined
      ? []
      : [
          `URL name held: '${result.slug}'. It starts resolving at /${result.slug} when you publish — until then nobody can look it up, which is what keeps /staging/{aid} unguessable.`,
        ]),
    ...(result.withdrawn.length > 0 ? [`Withdrawn from staging (no longer in this repository): ${result.withdrawn.join(", ")}.`] : []),
    ...recordNote(result.recordIssues, result.recordIssuesCapped),
    provenance(result.commit, result.dirty),
  ].join("\n");
}

async function narratePublish(root: string, confirm: boolean): Promise<string> {
  const result = await publishSharedApp(root, { confirm });
  if (!result.ok) return result.problems.join("\n");
  const plural = result.cids.length === 1 ? "" : "s";
  return [
    `Published apps/${result.aid}: promoted ${result.cids.length} staged collection${plural} (${result.cids.join(", ")}).`,
    result.publicOpen
      ? `The app is now OPEN to anonymous visitors${at(result.slug)}.`
      : "The app is NOT open to anonymous visitors — app.json declares no `public` block, so the promoted schemas are readable only by the roster.",
    ...recordNote(result.recordIssues, result.recordIssuesCapped),
    provenance(result.commit, result.dirty),
  ].join("\n");
}

async function narrateUnpublish(root: string): Promise<string> {
  const result = await unpublishSharedApp(root);
  if (!result.ok) return result.problems.join("\n");
  return result.wasOpen
    ? `Unpublished apps/${result.aid}: the public block is gone, so anonymous access is closed${noLonger(result.slug)}, and the public config document was deleted. ` +
        "The promoted schemas were left in place, so publishing again is a promotion."
    : `apps/${result.aid} was already closed to the public — nothing was open to take down. The public config document was deleted if it was still there.`;
}

/** Run one action against `root` and narrate the result. The agent's whole contract with this
 *  tool is actionable prose, so a refusal is text and never a throw. */
export async function manageSharedApp(root: string, args: unknown): Promise<string> {
  const body = isRecord(args) ? args : {};
  const action = parseAction(body.action);
  if (action === null) return `manageSharedApp: action must be one of ${SHARED_APP_ACTIONS.join(", ")}.`;
  const confirm = body.confirm === true;
  if (action === "deploy") return narrateDeploy(root, confirm);
  if (action === "publish") return narratePublish(root, confirm);
  return narrateUnpublish(root);
}
