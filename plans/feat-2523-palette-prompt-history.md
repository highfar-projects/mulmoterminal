# feat: command palette — put a past prompt into the terminal (#2523)

Part of #2411, step 6 (content jump), last part: "入力したプロンプトの履歴：選んだものを今のターミナルに入れる".

## What

"Prompt: <first line>" for each prompt sent in the terminal the palette acts on, newest first, found
by its whole text. Picking one brings that terminal forward and inserts the prompt at its input
without sending it.

## Shape

- Whose: `promptSourceOf(cell)` (pure) — the acting cell (`useGridJumps.currentCell`) when it runs
  an agent with a session; not a launcher, a command cell, or a cell with no session yet. A cell
  that names no agent reads Claude's history, a custom agent's included.
- What: the Prompts pane's `GET /api/transcript/prompts` (session, agent, cwd), read on each opening
  and again from empty when the acting terminal changes; only the newest read lands. `readPrompt`
  moved, verbatim, from `PromptsPane.vue` to `common/promptHistory.ts` so both read rows alike.
- Where it goes: `insertText(slotKey, text)`, the path a dropped or dictated text takes — no CR.
- Rows: kind `prompt`, key `prompt:<index>` (its place in the history as read, so two alike stay
  apart), not in `>` or `@`.

GridView is unchanged: it sits at its line limit, and the acting cell comes through `useGridJumps`,
which already holds the grid state.
