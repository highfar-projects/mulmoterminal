// Who a publish would take off the roster, and the refusal that names them.
//
// Publish REPLACES the live roster with app.json's. Removing someone through `invite` and then
// publishing is the intended way to take them off, so an address missing from app.json cannot be
// told apart from an app.json older than the live roster — for example one owner publishing just
// after another invited somebody. Both look the same on disk. Naming the people and asking is right
// in both cases; refusing outright would be wrong in the first.
import { isRecord } from "../../../common/isRecord.js";

/** One address the live roster has and app.json does not, with the roles it would lose. */
export interface RosterRemoval {
  email: string;
  roles: Record<string, string>;
}

const APP_WIDE = "*";

function rolesOf(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
}

/** Addresses on the LIVE roster that app.json no longer lists. Empty when there is no live app to
 *  compare against: a missing document is a first publish, and an unreadable one means this
 *  account is not on its roster, where publish cannot write anyway. */
export function rosterRemovals(live: Record<string, unknown> | null, authoredMembers: Readonly<Record<string, unknown>>): RosterRemoval[] {
  if (live === null || !isRecord(live.members)) return [];
  return Object.entries(live.members)
    .filter(([email]) => !Object.hasOwn(authoredMembers, email))
    .map(([email, roles]) => ({ email, roles: rolesOf(roles) }))
    .sort((a, b) => a.email.localeCompare(b.email));
}

/** `editor`, `assignee on tasks`, or several of those joined. */
export function describeRoles(roles: Record<string, string>): string {
  const parts = Object.entries(roles).map(([scope, role]) => (scope === APP_WIDE ? role : `${role} on ${scope}`));
  return parts.length > 0 ? parts.join(", ") : "no role";
}

/** The lines naming each person, shared by publish's refusal and `check`'s report. */
export function removalLines(removals: readonly RosterRemoval[]): string[] {
  const noun = removals.length === 1 ? "person" : "people";
  return [
    `This publish would remove ${removals.length} ${noun} from the roster, and they would lose access to the app:`,
    ...removals.map((removal) => `  - ${removal.email} (${describeRoles(removal.roles)})`),
  ];
}

/** Publish's answer: null to go ahead, or the lines to refuse with. `confirmRemovals` is its own
 *  consent rather than `confirm`, which accepts records that do not fit the schema — agreeing to one
 *  must not be spent on the other. */
export function removalRefusal(removals: readonly RosterRemoval[], confirmRemovals: boolean | undefined): string[] | null {
  if (removals.length === 0 || confirmRemovals === true) return null;
  return [
    ...removalLines(removals),
    "publish stopped: app.json no longer lists them. If that is intended, re-run publish with `confirmRemovals: true`. " +
      "If not, app.json is older than the live roster — for example another owner invited them after this copy was written — so add them back with `invite` first.",
  ];
}
