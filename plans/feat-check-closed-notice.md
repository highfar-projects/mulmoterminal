# Tell the agent when a checklist is closed without answers (#3025)

## Problem

`requestCheck` tells the agent to end its turn and wait for the results as the user's next message.
Closing the card with its close button sends nothing, so the agent waits for a message that never comes.

## Change

- `common/paneCommand.ts`: `checkClosedNotice(check)` — one line, `Check "<title>" was closed without
  answers.`, through the same one-line / control-character cleaning as `checkSummary`.
- `TerminalGrid.vue`: the card's close button types that line into the enlarged cell, then closes the
  check. Sending, and a check replaced by a newer one, type nothing extra. The card closes even when the
  terminal cannot be typed into: closing is what the user asked for.
- `server/infra/tools/pane-tools.ts`: the `requestCheck` prompt says what the line means, so the agent
  does not ask again unprompted.
- Guide `pane-tools` (en/ja): the close bullet.

## Out of scope

- Sending the answers already given when closing (partial send is a separate idea).
