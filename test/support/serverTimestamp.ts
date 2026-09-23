// The `FirestoreDocs.timestamp` seam, for in-memory fakes.
//
// core 5.4.0 moved Timestamp CONSTRUCTION out of its store and onto this seam, which is what
// stopped `collection/server` requiring the optional `firebase` peer. The cost is that every
// fake implementing `FirestoreDocs` has to answer it too.
//
// The shape is not arbitrary: core recognises a stored instant by `isTimestampLike`, an object
// with integer `seconds` and `nanoseconds`. Returning exactly that makes a fake round-trip
// through encode/decode the way the real SDK value does — a stand-in that type-checks but
// decodes to nothing would leave every stamped field reading as a plain string.
export const fakeServerTimestamp = (seconds: number, nanoseconds: number): unknown => ({ seconds, nanoseconds });
