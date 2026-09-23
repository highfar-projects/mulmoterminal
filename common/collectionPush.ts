// The `POST /api/collections/:slug/calendar-push` response. The server builds it from the
// engine's outcome; the collection view reads it to say what the click did — both sides
// decide from it, so it lives here.
//
// The shape (and the route's path) mirrors MulmoClaude's `CollectionPushBody`
// (server/api/routes/collectionCalendarPush.ts) so the two hosts over the shared workspace
// answer the same plugin identically. Stated here rather than imported because the plugin does
// NOT export its own `CollectionPushResult` — unlike the refresh one, it is reachable only
// structurally, through `CollectionUi["pushCalendarCollection"]`. So nothing upstream checks
// this shape for us: what pins it is the key-set assertion in the shaper's spec.

export interface CollectionPushResult {
  /** Always true — "the push ran", not "records moved". The plugin's own type widens this
   *  to `boolean` but never reads it, and MulmoClaude pins it to `true`; a refusal is told
   *  through `errors`, so the two hosts stay identical on a field neither of them uses. */
  pushed: true;
  created: number;
  updated: number;
  /** Edited on both sides; skipped so neither version is destroyed. */
  conflicts: number;
  /** Records deleted locally, whether or not the deletion carried. */
  localDeletes: number;
  /** Of those, how many were deleted in Google too — `0` unless the collection opted in
   *  with `propagateDeletes`. */
  deletedInGoogle: number;
  /** Records that could not be pushed as they stand, each with its reason. */
  skipped: string[];
  /** Deletions left standing in Google, each with its reason — reported apart from `skipped` so
   *  one refusal does not read as a failed push. The record went away here and the event is still
   *  there, which the user has to be told; the rest of the push carried. */
  keptInGoogle: string[];
  /** Why the push as a whole did not do what was asked. */
  errors: string[];
}
