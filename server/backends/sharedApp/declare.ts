// Writing the declaration, instead of asking the agent to compose it.
//
// `app.json` is a small file, and every one of its failures found in testing came from the same
// place: the agent had to write it from memory, before anything could check it. It guessed the
// owner's address (the tool knows it), it wrote a `public` block that deploy refused for three
// separate reasons, and when a deploy failed it edited the file by hand — deleting the `aid` and
// creating a second, orphaned app.
//
// So the three things a person actually asks for become operations: start an app, check it, invite
// somebody. What stays out is anything that would make the file OURS — it is a committed
// declaration that people read and edit in a pull request, and it must survive being written by
// hand. These only ever change the key they are about.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { APP_MANIFEST_FILE, firestoreHandle, parseAuthoredApp } from "@mulmoclaude/core/collection/server";
import { isRecord } from "../../../common/isRecord.js";
import { declarationProblems, sharedCollections, type SharedAppFailure } from "./context.js";
import { createManifest, newAid, updateManifest } from "./manifestWrite.js";

/** The roles the rules understand, in the order a person picks from. */
export const APP_ROLE_NAMES = ["owner", "editor", "viewer", "participant"] as const;
export type AppRoleName = (typeof APP_ROLE_NAMES)[number];

export interface DeclareSuccess {
  ok: true;
  aid: string;
  /** The signed-in address the declaration now names as owner. */
  owner: string;
  slug?: string | undefined;
}

export type DeclareResult = DeclareSuccess | SharedAppFailure;

/** Start an app in this repository: `app.json` with the SIGNED-IN address as its owner.
 *
 *  The address is the whole reason this is an operation rather than a paragraph of instructions.
 *  It has to match what the rules see (`request.auth.token.email`), the agent cannot read it, and
 *  asking the user invites the one answer that fails at deploy — the address they think they are
 *  using. */
export async function initSharedApp(root: string, name: string | undefined, slug: string | undefined): Promise<DeclareResult> {
  // The file first, because "you already have one" is the more useful answer and it does not
  // depend on being connected. The write below is still `wx`, so the guarantee does not rest on
  // this check — two sessions racing still get one app.
  const existing = await readManifest(root);
  if (existing.ok) {
    return {
      ok: false,
      partial: false,
      problems: [
        `${path.join(root, APP_MANIFEST_FILE)} already exists — this repository already declares an app.`,
        "Overwriting it would replace the roster, which is the app's permission list. Edit the file, or use `invite` for one address.",
      ],
    };
  }
  const handle = firestoreHandle();
  if (!handle) {
    return {
      ok: false,
      partial: false,
      problems: [
        "starting an app needs a signed-in session: connect remote-host first.",
        "The declaration names its owner by EMAIL, and it has to be the address this machine is signed in with — guessing it produces an app nobody can deploy.",
      ],
    };
  }
  const aid = newAid();
  const manifest: Record<string, unknown> = {
    ...(name === undefined ? {} : { name }),
    ...(slug === undefined ? {} : { slug }),
    aid,
    members: { [handle.email]: { "*": "owner" } },
  };
  const written = await createManifest(root, manifest);
  if (!written.ok) return { ok: false, partial: false, problems: written.problems };
  return { ok: true, aid, owner: handle.email, slug };
}

export interface CheckReport {
  ok: true;
  aid: string | undefined;
  collections: string[];
  /** The signed-in address the check ran as, or null when there is no session. */
  checkedAs: string | null;
  /** The address the declaration names as app-wide owner, when it names one. */
  declaredOwner: string | undefined;
  problems: string[];
}

/** Everything wrong with the declaration and this repository's collections, WITHOUT writing
 *  anything or touching the app.
 *
 *  The gate that used to run only at deploy. An agent that has just written a declaration cannot
 *  otherwise find out whether it is deployable — and in testing it did not: the invalid `public`
 *  block travelled all the way to a live refusal, and by then the agent was editing files to
 *  recover. */
export async function checkSharedApp(root: string): Promise<CheckReport | SharedAppFailure> {
  const raw = await readManifest(root);
  if (!raw.ok) return raw;
  const parsed = parseAuthoredApp(raw.text);
  if (!parsed.ok) return { ok: true, aid: undefined, collections: [], checkedAs: null, declaredOwner: undefined, problems: parsed.problems };

  const collections = await sharedCollections(root);
  const handle = firestoreHandle();
  // The SAME gate a deploy runs, not a second opinion. `check` exists to answer "would a deploy be
  // refused?", and a separate implementation of that question answers it differently — this one
  // used to miss the `owner` uid mismatch and call a declaration deployable that deploy then
  // refused.
  const problems = declarationProblems(parsed.app, collections, handle);
  return {
    ok: true,
    aid: parsed.app.aid,
    collections: collections.map((collection) => collection.slug),
    checkedAs: handle?.email ?? null,
    declaredOwner: ownerFromRoster(parsed.app),
    problems,
  };
}

/** The first address the declaration makes an app-wide owner, or undefined when it names none.
 *
 *  Used only to ask the offline question as somebody. A declaration with no app-wide owner is a
 *  real problem, and passing an empty address is how `publishProblems` is asked to say so. */
function ownerFromRoster(app: { members: Record<string, Record<string, string>> }): string | undefined {
  return Object.entries(app.members).find(([, roles]) => roles["*"] === "owner")?.[0];
}

export interface InviteSuccess {
  ok: true;
  email: string;
  role: AppRoleName | null;
  cid: string;
}

/** Add, change or remove one address on the roster.
 *
 *  One key, left where it was — the file belongs to the author, and an operation that rewrote it
 *  would be a worse version of editing it by hand. `role: null` removes. */
export async function inviteToSharedApp(root: string, email: string, role: AppRoleName | null, cid: string): Promise<InviteSuccess | SharedAppFailure> {
  let orphaned = false;
  const updated = await updateManifest(root, (manifest) => {
    const next = nextMembers(manifest, email, role, cid);
    if (next === null) return null;
    // An app with no app-wide owner has no publisher: every deploy is refused, INCLUDING the one
    // that would put an owner back. The file can still be edited by hand, but this tool must not
    // be the way somebody locks themselves out — removing or demoting an owner is fine once
    // another one exists.
    if (!hasOwner(next)) {
      orphaned = true;
      return null;
    }
    return next;
  });
  if (orphaned) {
    return {
      ok: false,
      partial: false,
      problems: [
        `that would leave the app with no owner: ${email} is the only address holding \`"*": "owner"\`.`,
        "An app with no owner cannot be deployed at all — not even to put an owner back. Add another owner first, then remove this one.",
      ],
    };
  }
  if (!updated.ok) return { ok: false, partial: false, problems: updated.problems };
  return { ok: true, email, role, cid };
}

/** The declaration with one roster entry changed, or null when it already says that.
 *
 *  Built by filtering rather than by deleting keys: the roster is the permission list, and an
 *  entry that half-survives a removal is the failure mode the rules cannot save us from —
 *  `membersConsistent()` would reject the deploy, which is the good case, but only after the
 *  operator believed somebody had been removed. */
function nextMembers(manifest: Record<string, unknown>, email: string, role: AppRoleName | null, cid: string): Record<string, unknown> | null {
  const members = isRecord(manifest.members) ? manifest.members : {};
  const current = isRecord(members[email]) ? members[email] : {};
  const kept = Object.entries(current).filter(([key]) => key !== cid);
  const roles = Object.fromEntries(role === null ? kept : [...kept, [cid, role]]);
  const others = Object.entries(members).filter(([key]) => key !== email);
  const nextRoster = Object.fromEntries(Object.keys(roles).length === 0 ? others : [...others, [email, roles]]);
  if (JSON.stringify(nextRoster) === JSON.stringify(members)) return null;
  return { ...manifest, members: nextRoster };
}

/** Does this declaration still name somebody who may publish it? */
function hasOwner(manifest: Record<string, unknown>): boolean {
  const members = isRecord(manifest.members) ? manifest.members : {};
  return Object.values(members).some((roles) => isRecord(roles) && roles["*"] === "owner");
}

async function readManifest(root: string): Promise<{ ok: true; text: string } | SharedAppFailure> {
  const manifestPath = path.join(root, APP_MANIFEST_FILE);
  try {
    return { ok: true, text: await readFile(manifestPath, "utf-8") };
  } catch (err) {
    return {
      ok: false,
      partial: false,
      problems: [`cannot read ${manifestPath}: ${String(err)}`, "This repository does not declare an app yet — start one with `init`."],
    };
  }
}
