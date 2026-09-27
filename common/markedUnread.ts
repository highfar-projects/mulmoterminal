// The activity event a session carries after the user marked it unread from the roster (#2299).
//
// Its own name rather than a reused "Stop": the row should read as done (activityStatus maps any
// waiting event but "Notification" to done), but nothing actually finished, so the attention sound
// must stay silent — and notifyKind announces a Stop that raises `waiting` as a finished turn.
export const MARKED_UNREAD_EVENT = "MarkedUnread";
