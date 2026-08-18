// The one place the `showLoadAverage` setting is defined (#1786). Both sides decide from it — the
// server sanitizes what the config file says, the browser hydrates a flag from the same field —
// and a default that disagrees across the two shows up only as a checkbox that does not match
// what the server does.

/** ON unless the config says otherwise: the read-out is the feature, and a header that has to be
 *  switched on is one nobody finds. */
export const SHOW_LOAD_AVERAGE_DEFAULT = true;

// The KEY deliberately stays a literal on both sides. `settings-coverage.spec.ts` proves a
// setting is reachable by finding `createGlobalFlag("<key>"` in the Settings sources, so a shared
// constant there buys nothing and silently removes that guarantee — the name is already pinned,
// it is the DEFAULT that could drift unseen.

/** Anything that is not a boolean is "unconfigured", which is what every config file written
 *  before this feature existed contains. */
export const sanitizeShowLoadAverage = (input: unknown): boolean => (typeof input === "boolean" ? input : SHOW_LOAD_AVERAGE_DEFAULT);
