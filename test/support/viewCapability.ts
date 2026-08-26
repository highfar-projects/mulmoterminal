/** One collection's capability, as the server resolves it for the author.
 *
 *  WRITTEN OUT RATHER THAN BUILT, so the SHAPE a page reads is pinned rather than derived from the
 *  same code that produces it: `can` is keyed by collection, and a page reaching for
 *  `viewer.can.transitionAny` gets undefined for every app that has ever existed.
 *
 *  Its own module because it is a FIXTURE two specs compare against and one of them is at the
 *  file-length cap — and because a shape pinned in two places is a shape that can drift into
 *  disagreeing with itself.
 *
 *  Every flag refuses, which is the right default for a fixture: a test that needs a permission
 *  says so by overriding it, and one that forgot is answered "no" rather than "yes". */
export const MEMBER_CAPABILITY = {
  cid: "bookings",
  transitionAny: true,
  transitionOwn: false,
  assign: false,
  assignees: [],
  withdrawFrom: [],
  withdrawAny: false,
  sealed: [],
  /** The fields a submitter may CORRECT in their own row, per status. */
  correctFrom: {},
  /** The ROLE half of the same ask: any field, any row, no status. Not narrowed by the map beside
   *  it — `isWriter` in the rules carries no field list at all. */
  correctAny: false,
};
