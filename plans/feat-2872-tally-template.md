# feat: tally template — only the totals are public (#2872)

"Show only the totals" as a DATA SHAPE, with no new key: the counted field lives in `votes`
(`public.read`, `choice` + `status` only), names and comments in `notes` (private), both
`idFrom: "auth.uid"` so they join by id, and the public page counts the votes it reads.
Scaling past roughly ten thousand votes: receptron/mulmoserver#324.

- One write per press: vote, then (optionally) name + comment as a second press. Two writes in one
  press lose the gesture mark on the second and the preview host drops it (project-board.md)
- The page asks `view.mine` in `onState` whether this visitor already voted / left a note
- SKILL.md: the visibility question points to this template for "only the totals" instead of
  saying there is no mechanism; template list; guides
