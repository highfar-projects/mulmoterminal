# feat(sharedApp): say at invite that a new address enters the committed app.json (#1963)

## Why

The roster is keyed by plain addresses (the rules compare `email() in members`) and `app.json` is
committed, so every new invite puts an address into the repository's history for good. #1932 kept
the roster in the file; the remaining risk is the moment the repository is published or handed over,
and the author can judge that only if told. The skill text is not read by whoever runs `invite`; its
reply is.

## Change

- `InviteSuccess.addedAddress`: true when the address was not on the roster (case-insensitively) and
  a role is being given.
- `narrateInvite` appends one line when it is true.

Not said for a removal, a role change, another collection's role, or the same address in other
case — no new string enters the file. Said again for an address added back after being removed
entirely, since the file gains it again.
