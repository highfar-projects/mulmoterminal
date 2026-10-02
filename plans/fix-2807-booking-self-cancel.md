# Booking templates promise a self-cancel their customers cannot reach (#2807)

`meeting-room.md`, `salon.md` and `gym.md` put the booker's cancellation on a `participant` page (`/p/{slug}`). That
page is readable only by addresses in `members`, and a visitor who booked from the public page is not one.

What the platform offers today (checked, not assumed):

- A public page (`/a/`) and a participant page get the SAME moves over the reader's own row (`writeFor` in
  `@receptron/sharedapp` `appViews.js`: both are `ownRow` in the rules), and the preview performs them alike.
- The public page RECEIVES the reader's own rows in `viewer.mine`: by id for `idFrom: "auth.uid"`, and by a query on
  `uidField` / `emailField` otherwise — `idFrom: "field"` included (mulmoserver `src/firestore/publicAnswer.ts`
  `ownLookup`; the preview's `ownsRow`). Only `auth.uid+field` has no list; `view.mine(cid, key)` answers that one.
- The rows carry the id and the fields the page could have sent — NOT the status.

So the issue's premise ("the public page cannot find the booking") holds only for status. Per template:

- **meeting-room, class-seats** (one status, `booked`): the booker withdraws on the PUBLIC page, from
  `viewer.mine.bookings`; `/p/` and the `mine` view go. class-seats gains `selfDelete` (it had only the desk's
  `writerDelete`, on the reasoning that the booking could not be found, which was wrong).
- **salon** (pending / approved / cancelled): the page cannot tell which own rows may be cancelled, so the customer
  asks the shop and the desk moves the booking to `cancelled` (now also from `pending`). `mine`, `selfTransitions`
  and `selfUpdate` go.
- **gym** (requested / cancelled, `auth.uid+field`): keeps `/p/`, and says only invited members reach it — the
  template is built for a members' gym and already invites them for the queue position. A gym that does not invite
  drops `mine` and cancels at the desk.

Tests: a guard in `skillTemplates.spec.ts` that a template taking public submissions puts nothing for those people on a
participant page (gym allowed, with its reason); a guard that every `view.withdraw("<cid>")` has a delete declared;
page tests for the own-booking list and withdraw on meeting-room's and class-seats' public pages.

Apps already published from these templates keep the unreachable page; their owners need telling (PR body).
