# Booking templates promise a self-cancel their customers cannot reach (#2807)

`meeting-room.md`, `salon.md` and `gym.md` put the visitor's cancellation on a `participant` page (`/p/{slug}`). That
page is readable only by addresses in `members`, and none of these templates lists its customers there, so a visitor
who booked through the public page has no way to cancel.

What the platform offers today (checked, not assumed):

- A public page (`/a/`) and a participant page get the SAME moves over the visitor's own row (`writeFor` in
  `@receptron/sharedapp` `appViews.js`: both are `ownRow` in the rules).
- A public page can FIND the visitor's own row only where the id is built from the uid: `view.mine(cid, key)` answers
  `auth.uid` and `auth.uid+field`, and refuses `idFrom: "field"` on purpose (mulmoserver
  `src/composables/publicOwnLookup.ts`). So option 2 of the issue is not available for `field`.

Per template:

- **meeting-room, salon** (`idFrom: "field"`): option 1, as `class-seats.md` already does. Drop the `mine` view and the
  visitor's own moves (`selfDelete` / `selfTransitions` / `selfUpdate`); the customer asks the desk.
  - meeting-room: `writerDelete` and a cancel button on the desk, which deletes the booking and reopens the slot in
    one batch.
  - salon: the desk moves the booking to `cancelled` (now also from `pending`), keeping the row for the record and the
    mail, as the template already argues; reopening the slot stays the desk's separate step.
- **gym** (`auth.uid+field`): keep `/p/`, and say who reaches it. The template is built for a members' gym — its
  "read access" section already puts members on the roster (`participant` + `peerVisibility: "public"`) so they see
  their place in the queue — and an invited member opens `/p/` and cancels there. What was missing is saying that only
  invited addresses reach it: a gym that does not invite its members drops the `mine` view and cancels at the desk,
  which already has the button. Moving the cancel to the public page was considered and dropped: `view.mine` returns
  only the fields a page could have sent, so the public page cannot tell a cancelled booking from a live one.

Tests: `skillTemplates.spec.ts` (each still deploys; no visitor page left where the visitor cannot reach it), and page
tests for the desk's cancel button in meeting-room. Cross references in `class-seats.md` and `SKILL.md` follow.

Apps already published from these templates keep the unreachable page; their owners need telling (PR body).
