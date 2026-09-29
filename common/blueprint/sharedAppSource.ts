// A shared app as the source of a build: how the form names one, and whether the person copying it may read every record
// of each of its collections. Only the decisions live here; reading the app is the server's.
import { isRecord } from "../isRecord.js";

/** A source answer naming a shared app rather than a collection: `app:` and the opaque id of the folder it lives in. */
export const APP_SOURCE_PREFIX = "app:";

export const appSourceValue = (projectId: string): string => `${APP_SOURCE_PREFIX}${projectId}`;

/** The folder id an answer names, or null when the answer names a collection. */
export const appIdOf = (answer: string): string | null => (answer.startsWith(APP_SOURCE_PREFIX) ? answer.slice(APP_SOURCE_PREFIX.length) : null);

// The roles the rules let read every record of a collection. Anyone else — a participant, an assignee — reads a part,
// and a copy made with that part would be silently short.
const FULL_READERS: ReadonlySet<string> = new Set(["owner", "editor", "viewer"]);

const rolesOf = (members: unknown, email: string): Record<string, unknown> => {
  if (!isRecord(members)) return {};
  const entry = Object.entries(members).find(([address]) => address.toLowerCase() === email.toLowerCase())?.[1];
  return isRecord(entry) ? entry : {};
};

/** The collections whose records `email` cannot read in full under the app's roster: its role there, else its app-wide one. */
export function collectionsNotFullyReadable(manifest: unknown, email: string, cids: readonly string[]): string[] {
  const roles = rolesOf(isRecord(manifest) ? manifest.members : undefined, email);
  return cids.filter((cid) => {
    const role = roles[cid] ?? roles["*"];
    return typeof role !== "string" || !FULL_READERS.has(role);
  });
}
