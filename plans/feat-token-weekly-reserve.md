# feat: a per-token weekly reserve for token rotation (#3064)

## Why
Rotation spends every subscription to the 98% weekly line. A subscription the user also needs
outside MulmoTerminal must keep part of its week.

## What
- `tokenRotation.tokens[].reserveWeeklyPercent` (optional, `0 < x <= 99`), parsed in
  `common/tokenRotation.ts`; anything else is dropped and the entry kept.
- `server/agents/token/token-choice.ts`: the weekly ceiling becomes `min(98, 100 - reserve)` for
  holding a candidate out (`blockedUntil`) and for moving a running session (`nearLimit`); the
  burn pace counts only the room above the reserve.
- The "everything held out" fallback never picks a candidate whose week is down to its reserve —
  that would spend the reserve. When nothing else remains, `chooseToken` returns null and rotation
  says nothing for that spawn.
- `token-assignment.ts` / `token-rotation-service.ts` pass the config's reserve through.

## Not done
- No Settings UI: `tokenRotation` has none today; it is written by hand or by the
  `mulmoterminal-model` skill, whose doc is updated.
